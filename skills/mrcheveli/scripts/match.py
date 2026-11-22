#!/usr/bin/env python3
"""mrcheveli: picks plugins from the catalog for one person's answers.

No network, no dependencies, Python 3.9 or later. match.mjs is its twin and
must print the same bytes.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
REPO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$")
INSTALL_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}@[a-z0-9][a-z0-9-]{0,63}$")
# The surfaces where the skill runs the install command itself, on the person's yes.
COMMAND_SURFACES = ("claude-code", "codex-cli")
MAX_RECOMMEND = 5
MAX_HINTS = 4
TIER_RANK = {"anthropic": 0, "openai": 0, "partner": 1, "third-party": 2}
USAGE = """usage:
  match.py --answers <file> [--format md|json] [--catalog <file>]
  match.py --questions --surface <surface> [--role <activity>] [--lang ka|en] [--catalog <file>]"""


class Refusal(Exception):
    pass


def refuse(message):
    raise Refusal(message)


def read_json(path, what):
    try:
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
    except OSError:
        refuse("%s: cannot read %s" % (what, path))
    try:
        return json.loads(text)
    except ValueError:
        refuse("%s: %s is not valid JSON" % (what, path))


def fmt(template, values):
    out = template
    for key in values:
        out = out.replace("{" + key + "}", str(values[key]))
    return out


def by_id(items):
    return {item["id"]: item for item in items}


def is_string_list(value):
    return isinstance(value, list) and all(isinstance(v, str) for v in value)


def unique(items):
    seen = set()
    out = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


# ---- answers ---------------------------------------------------------------


def normalize(answers, catalog):
    tax = catalog["taxonomy"]
    if not isinstance(answers, dict):
        refuse("answers: must be a JSON object")
    known = ["lang", "surface", "role", "tasks", "uses", "limits", "installed"]
    for key in answers:
        if key not in known:
            refuse("answers.%s: unknown field. Fields: %s" % (key, ", ".join(known)))
    lang = answers.get("lang", "ka")
    if lang not in ("ka", "en"):
        refuse('answers.lang: must be "ka" or "en"')

    surface = answers.get("surface")
    if surface not in tax["surfaces"]:
        refuse("answers.surface: must be one of %s" % ", ".join(tax["surfaces"]))
    if not isinstance(answers.get("role"), str) or not answers["role"].strip():
        refuse("answers.role: describe an activity")
    for key in ("tasks", "uses", "limits", "installed"):
        if key in answers and not is_string_list(answers[key]):
            refuse("answers.%s: must be a list of strings" % key)
    tasks = unique(answers.get("tasks", []))
    task_ids = [t["id"] for t in tax["tasks"]]
    for task in tasks:
        if task not in task_ids:
            refuse('answers.tasks: unknown task "%s"' % task)
    limits = unique(answers.get("limits", []))
    if "none" in limits:
        if len(limits) > 1:
            refuse('answers.limits: "none" cannot stand beside another limit')
        limits = []
    limit_ids = [l["id"] for l in tax["limits"]]
    for limit in limits:
        if limit not in limit_ids:
            refuse('answers.limits: unknown limit "%s". One of: %s' % (limit, ", ".join(limit_ids)))
    services = by_id(catalog["services"])
    groups = by_id(tax["groups"])
    direct = []
    used_groups = []
    for use in unique(answers.get("uses", [])):
        if use.startswith("group:"):
            group = groups.get(use[6:])
            if group is None:
                refuse('answers.uses: unknown group "%s"' % use)
            used_groups.append(group["id"])
            used_groups.extend(group.get("also", []))
        elif use in services:
            direct.append(use)
        else:
            refuse('answers.uses: unknown service "%s". Run with --questions to list them' % use)
    if not tasks and not direct:
        refuse("answers.tasks: give at least one task, or name a service in answers.uses")
    installed = unique([name.split("@")[0] for name in answers.get("installed", [])])
    return {
        "lang": lang,
        "surface": surface,
        "tasks": tasks,
        "limits": limits,
        "direct": direct,
        "usedGroups": unique(used_groups),
        "installed": installed,
    }


# ---- the choice ------------------------------------------------------------


def group_name(group, lang):
    """A group's short name where it has one: the long label is the wording of the question."""
    return (group.get("short") or group["label"])[lang]


def service_view(service, lang, m, named):
    """A service the person named is one they already use: its status is only said when the
    catalog holds that it does not work in Georgia. Any other service gets its status in full."""
    g = service["georgia"]
    text = service["name"]
    if named:
        if g["status"] == "no":
            text = fmt(m["flag.usedNo"], {"name": service["name"]})
    elif g["status"] == "partial":
        text = fmt(m["flag.partial"], {"name": service["name"], "note": g["note"][lang]})
    elif g["status"] == "unknown":
        text = fmt(m["flag.unknown"], {"name": service["name"]})
    return {"id": service["id"], "name": service["name"], "georgia": g["status"], "text": text}


def platform_of(catalog, surface):
    """A surface belongs to one platform: Claude or ChatGPT."""
    for platform in catalog["taxonomy"]["platforms"]:
        if surface in platform["surfaces"]:
            return platform
    refuse("catalog: surface %s belongs to no platform" % surface)


def wording(messages, lang, platform, surface):
    """The messages of one language as one platform says them.

    A key that ends in "@<platform>" takes the place of the plain key, and {assistant} and
    {owner} become the platform's names.
    """
    base = messages[lang]
    suffix = "@" + platform["id"]
    out = {}
    for key in base:
        if "@" not in key:
            out[key] = base[key]
    for key in base:
        if key.endswith(suffix):
            out[key[: len(key) - len(suffix)]] = base[key]
    for key in out:
        out[key] = fmt(out[key], {"assistant": platform["assistant"][surface], "owner": platform["owner"]})
    return out


def install_steps(plugin, catalog, surface, to_connect, m):
    market = catalog["marketplaces"].get(plugin["marketplace"])
    if market is None:
        refuse("catalog: marketplace of %s is not allowed" % plugin["id"])
    # Every command below is built from these names and nothing else.
    if (
        not NAME_RE.match(plugin["name"])
        or not NAME_RE.match(plugin["marketplace"])
        or not INSTALL_RE.match(plugin["install"])
    ):
        refuse("catalog: %s is not a safe plugin name" % plugin["id"])
    if surface == "codex-cli":
        # One command, and the way by hand for when it refuses.
        return {
            "surface": surface,
            "steps": [
                m["cli.intro"],
                " ".join(
                    [m["cli.new"]]
                    + ([m["cli.signin"]] if to_connect else [])
                    + [fmt(m["cli.remove"], {"remove": "codex plugin remove %s" % plugin["install"]})]
                ),
                fmt(m["cli.manual"], {"title": plugin["title"]}),
            ],
            "commands": ["codex plugin add %s" % plugin["install"]],
        }
    if surface == "chatgpt-app":
        return {
            "surface": surface,
            "steps": [
                m["chat.step.open"],
                fmt(m["chat.step.find"], {"title": plugin["title"]}),
                m["chat.step.install"],
                m["chat.step.connect"] if to_connect else m["chat.step.noConnect"],
                m["chat.step.new"],
            ],
            "commands": [],
        }
    if not REPO_RE.match(market["repo"] or ""):
        refuse("catalog: marketplace of %s is not allowed" % plugin["id"])
    if surface == "claude-code":
        return {
            "surface": surface,
            "steps": [
                m["code.intro"],
                " ".join(
                    [m["code.reload"]]
                    + ([m["code.signin"]] if to_connect else [])
                    + [fmt(m["code.remove"], {"remove": "claude plugin uninstall %s" % plugin["install"]})]
                ),
            ],
            "commands": [
                "claude plugin marketplace add %s" % market["repo"],
                "claude plugin install %s" % plugin["install"],
            ],
        }
    if not to_connect:
        last = m["app.step.noConnect"]
    elif plugin["connectors"] == 0:
        last = fmt(m["app.step.connectDirectory"], {"list": m["list.and"].join(to_connect)})
    else:
        last = m["app.step.connect"]
    return {
        "surface": surface,
        "steps": [
            m["app.step.open"],
            fmt(m["app.step.find"], {"name": plugin["name"], "repo": market["repo"]}),
            m["app.step.install"],
            last,
        ],
        "commands": [],
    }


def recommend(catalog, messages, answers):
    a = normalize(answers, catalog)
    lang = a["lang"]
    platform = platform_of(catalog, a["surface"])
    m = wording(messages, lang, platform, a["surface"])
    tax = catalog["taxonomy"]
    services = by_id(catalog["services"])
    groups = by_id(tax["groups"])
    tasks = by_id(tax["tasks"])
    tiers = by_id(tax["tiers"])
    sep = m["list.and"]

    def is_installed(plugin):
        # A plugin is installed when the person's list holds its name, or another id it goes by.
        return plugin["name"] in a["installed"] or any(i in a["installed"] for i in plugin["aka"])

    candidates = []
    excluded = []
    hints = []
    covered = set()

    for plugin in catalog["plugins"]:
        if a["surface"] not in plugin["surfaces"]:
            continue
        task_hits = [t for t in a["tasks"] if t in plugin["tasks"]]
        required_direct = [s for s in plugin["requires"] if s in a["direct"]]
        required_group = [s for s in plugin["requires"] if services[s]["group"] in a["usedGroups"]]
        relevant = bool(task_hits) or bool(required_direct)
        if plugin["kind"] == "service" and not required_direct:
            relevant = False
            hints.append(
                {
                    "plugin": plugin,
                    "service": services[plugin["requires"][0]],
                    "byGroup": bool(required_group),
                    "taskHits": task_hits,
                }
            )
        if not relevant:
            continue
        # A task is covered once a plugin for it was considered, also one left out below with its reason.
        covered.update(task_hits)

        name = plugin["name"]
        if is_installed(plugin):
            excluded.append(
                {
                    "id": plugin["id"],
                    "name": name,
                    "reason": "installed",
                    "text": fmt(m["excluded.installed"], {"name": plugin["title"]}),
                }
            )
            continue
        if "known-publishers" in a["limits"] and plugin["tier"] == "third-party":
            excluded.append(
                {
                    "id": plugin["id"],
                    "name": name,
                    "reason": "known-publishers",
                    "text": fmt(
                        m["excluded.known-publishers"], {"name": plugin["title"], "publisher": plugin["publisher"]}
                    ),
                }
            )
            continue
        if "no-money" in a["limits"] and plugin["money"]:
            excluded.append(
                {
                    "id": plugin["id"],
                    "name": name,
                    "reason": "no-money",
                    "text": fmt(m["excluded.no-money"], {"name": plugin["title"]}),
                }
            )
            continue

        optional = [
            s for s in plugin["services"] if s in a["direct"] or services[s]["group"] in a["usedGroups"]
        ]
        score = (
            3 * len(task_hits)
            + (4 if required_direct else 0)
            + min(2, len(optional))
            + (1 if plugin["tier"] == platform["tier"] else 0)
        )
        candidates.append({"plugin": plugin, "taskHits": task_hits, "score": score})

    # Role plugins come before plugins for one service, so that a bundle is read before the
    # narrower plugin that adds to it.
    candidates.sort(
        key=lambda c: (
            1 if c["plugin"]["kind"] == "service" else 0,
            -c["score"],
            TIER_RANK[c["plugin"]["tier"]],
            c["plugin"]["id"],
        )
    )

    # A plugin that is one connector and no skill adds nothing beside a bundle that holds the same
    # connector: it is left out, with that reason.
    chosen = []
    overflow = []
    overflow_titles = []
    for candidate in candidates:
        plugin = candidate["plugin"]
        if plugin["kind"] == "service" and plugin["skills"] == 0:
            bundle = None
            for other in chosen:
                if (
                    other["plugin"]["kind"] != "service"
                    and not other["plugin"]["worksWith"]
                    and plugin["requires"][0] in other["plugin"]["services"]
                ):
                    bundle = other["plugin"]
                    break
            if bundle is not None:
                excluded.append(
                    {
                        "id": plugin["id"],
                        "name": plugin["name"],
                        "reason": "in-bundle",
                        "text": fmt(
                            m["excluded.in-bundle"],
                            {
                                "name": plugin["title"],
                                "bundle": bundle["title"],
                                "service": services[plugin["requires"][0]]["name"],
                            },
                        ),
                    }
                )
                continue
        if len(chosen) < MAX_RECOMMEND:
            chosen.append(candidate)
        else:
            overflow.append(plugin["name"])
            overflow_titles.append(plugin["title"])

    items = []
    for candidate in chosen:
        plugin = candidate["plugin"]
        connect = []
        choose_by_group = {}
        not_in_georgia = []
        money_skipped = []
        rest = 0
        for sid in plugin["services"]:
            service = services[sid]
            g = service["georgia"]
            named = sid in a["direct"]
            if g["status"] == "no" and not named:
                text = fmt(
                    m["flag.no"],
                    {"name": service["name"], "note": g["note"][lang], "source": g["source"]},
                )
                not_in_georgia.append({"id": service["id"], "name": service["name"], "text": text})
            elif "no-money" in a["limits"] and service["money"]:
                money_skipped.append({"id": service["id"], "name": service["name"]})
            elif named:
                connect.append(service_view(service, lang, m, True))
            elif service["group"] in a["usedGroups"]:
                choose_by_group.setdefault(service["group"], []).append(
                    service_view(service, lang, m, False)
                )
            else:
                rest += 1
        choose = []
        for group_id in choose_by_group:
            choose.append(
                {
                    "group": group_id,
                    "label": group_name(groups[group_id], lang),
                    "services": choose_by_group[group_id],
                }
            )

        why = []
        if candidate["taskHits"]:
            why.append(
                fmt(m["why.task"], {"label": "; ".join(tasks[t]["label"][lang] for t in candidate["taskHits"])})
            )
        used_names = [s["name"] for s in connect]
        for sid in plugin["requires"]:
            service = services[sid]
            if sid in a["direct"] and service["name"] not in used_names:
                used_names.append(service["name"])
        if used_names:
            why.append(fmt(m["why.uses"], {"list": sep.join(used_names)}))

        warnings = []
        for sid in plugin["requires"]:
            service = services[sid]
            g = service["georgia"]
            if g["status"] == "no":
                warnings.append(
                    fmt(
                        m["requires.no"],
                        {"name": service["name"], "note": g["note"][lang], "source": g["source"]},
                    )
                )
            if g["status"] == "partial":
                warnings.append(
                    fmt(m["requires.partial"], {"name": service["name"], "note": g["note"][lang]})
                )

        access = [m["access." + flag] for flag in plugin["access"]]
        if plugin["worksWith"]:
            access.append(m["access.worksWith"])
        else:
            access.append(m["access.none"] if plugin["services"] else m["access.noConnector"])

        # A plugin for one service, beside a role plugin that holds the same connector: say what it adds.
        overlap = ""
        if plugin["kind"] == "service":
            beside = [
                c["plugin"]
                for c in chosen
                if c["plugin"]["kind"] != "service" and plugin["requires"][0] in c["plugin"]["services"]
            ]
            bundle = next((b for b in beside if not b["worksWith"]), None)
            user = next((b for b in beside if b["worksWith"]), None)
            service = services[plugin["requires"][0]]["name"]
            if bundle is not None:
                overlap = fmt(
                    m["item.overlap"], {"bundle": bundle["title"], "service": service, "skills": plugin["skills"]}
                )
            elif user is not None:
                overlap = fmt(m["item.overlap.worksWith"], {"bundle": user["title"], "service": service})

        items.append(
            {
                "id": plugin["id"],
                "name": plugin["name"],
                "title": plugin["title"],
                "marketplace": plugin["marketplace"],
                "publisher": plugin["publisher"],
                "tier": plugin["tier"],
                "tierLabel": fmt(tiers[plugin["tier"]]["label"][lang], {"owner": platform["owner"]}),
                "score": candidate["score"],
                "what": plugin["what"][lang],
                "why": why,
                "skills": plugin["skills"],
                "connectors": plugin["connectors"],
                "worksWith": plugin["worksWith"],
                "seen": plugin["source"].get("seen") or "",
                "overlap": overlap,
                "connect": connect,
                "choose": choose,
                "notInGeorgia": not_in_georgia,
                "moneySkipped": money_skipped,
                "rest": rest,
                "warnings": warnings,
                "access": access,
                "install": install_steps(
                    plugin,
                    catalog,
                    a["surface"],
                    [s["name"] for s in connect] + [c["label"] for c in choose],
                    m,
                ),
            }
        )

    uncovered = [t for t in a["tasks"] if t not in covered]

    # A service's own plugin is mentioned when the person said they use a tool of its kind, or when
    # it is the only kind of plugin there is for a task of theirs.
    hints.sort(key=lambda h: h["plugin"]["id"])
    hint_items = []
    for hint in hints:
        plugin = hint["plugin"]
        if not (hint["byGroup"] or any(t in uncovered for t in hint["taskHits"])):
            continue
        if is_installed(plugin):
            continue
        if hint["service"]["georgia"]["status"] == "no":
            continue
        if "known-publishers" in a["limits"] and plugin["tier"] == "third-party":
            continue
        if "no-money" in a["limits"] and plugin["money"]:
            continue
        view = service_view(hint["service"], lang, m, False)
        hint_items.append(
            {
                "plugin": plugin["name"],
                "service": hint["service"]["name"],
                "georgia": hint["service"]["georgia"]["status"],
                "text": fmt(m["hints.item"], {"service": view["text"], "name": plugin["title"]}),
            }
        )
    hint_items = hint_items[:MAX_HINTS]

    tools = []
    for tool in catalog["georgianTools"]:
        if not any(t in a["tasks"] for t in tool["tasks"]):
            continue
        if "no-money" in a["limits"] and tool["money"]:
            continue
        if "known-publishers" in a["limits"]:
            continue
        if tool["status"] == "reviewed":
            status = fmt(
                m["tools.reviewed"],
                {"date": tool["reviewed"]["date"], "sha": tool["reviewed"]["sha"][:10]},
            )
        else:
            status = m["tools.listed"]
        tools.append(
            {
                "id": tool["id"],
                "name": tool["name"],
                "status": tool["status"],
                "url": tool["url"],
                "text": fmt(
                    m["tools.item"],
                    {"name": tool["name"], "status": status, "what": tool["what"][lang], "url": tool["url"]},
                ),
            }
        )

    notes = []
    if "managed" in a["limits"]:
        notes.append(m["managed.code"] if a["surface"] in COMMAND_SURFACES else m["managed.app"])

    # A service the person named that no chosen plugin connects to is said, not dropped. One whose
    # own plugin they already have installed is not among them.
    connected = set()
    installed_ids = [e["id"] for e in excluded if e["reason"] == "installed"]
    for plugin in catalog["plugins"]:
        if plugin["id"] in installed_ids:
            for sid in plugin["requires"]:
                connected.add(sid)
    for item in items:
        for s in item["connect"]:
            connected.add(s["id"])
        for s in item["moneySkipped"]:
            connected.add(s["id"])
    unconnected = [services[sid]["name"] for sid in a["direct"] if sid not in connected]

    unknown_shown = any(h["georgia"] == "unknown" for h in hint_items) or any(
        s["georgia"] == "unknown" for item in items for c in item["choose"] for s in c["services"]
    )

    return {
        "catalog": {"version": catalog["version"], "generated": catalog["generated"]},
        "lang": lang,
        "surface": a["surface"],
        "recommend": items,
        "excluded": excluded,
        "overflow": overflow,
        "overflowTitles": overflow_titles,
        "uncovered": [tasks[t]["label"][lang] for t in uncovered],
        "unconnected": unconnected,
        "hints": hint_items,
        "georgianTools": tools,
        "notes": notes,
        "unknownShown": unknown_shown,
        "issues": catalog["issues"],
    }


# ---- Markdown --------------------------------------------------------------


def render(result, catalog, messages):
    m = wording(messages, result["lang"], platform_of(catalog, result["surface"]), result["surface"])
    sep = m["list.and"]
    lines = [m["title"], ""]
    count = len(result["recommend"])
    if count > 0:
        lines.append(fmt(m["intro.some"], {"date": result["catalog"]["generated"], "count": count}))
    else:
        lines.append(fmt(m["intro.none"], {"date": result["catalog"]["generated"]}))
    if count > 0:
        lines.extend(["", m["glossary"]])
    for note in result["notes"]:
        lines.extend(["", note])

    for index, item in enumerate(result["recommend"]):
        lines.extend(["", "## %d. %s" % (index + 1, item["title"]), ""])
        lines.append(fmt(m["item.what"], {"text": item["what"]}))
        lines.append(fmt(m["item.why"], {"text": ". ".join(item["why"])}))
        lines.append(fmt(m["item.publisher"], {"publisher": item["publisher"], "tier": item["tierLabel"]}))
        # A plugin that works with other plugins says so wherever a bundle speaks of its connectors.
        w = item["worksWith"]
        if w:
            lines.append(fmt(m["item.contains.worksWith"], {"connectors": item["connectors"]}))
        elif item["connectors"] == 0:
            lines.append(fmt(m["item.contains.noConnectors"], {"skills": item["skills"]}))
        elif item["skills"] == 0:
            lines.append(fmt(m["item.contains.noSkills"], {"connectors": item["connectors"]}))
        else:
            lines.append(
                fmt(m["item.contains"], {"skills": item["skills"], "connectors": item["connectors"]})
            )
        if item["seen"] != "":
            lines.append(fmt(m["item.seen"], {"date": item["seen"]}))
        if item["overlap"] != "":
            lines.append(item["overlap"])
        if item["connect"]:
            lines.append(
                fmt(
                    m["item.connect.worksWith"] if w else m["item.connect"],
                    {"list": sep.join(s["text"] for s in item["connect"])},
                )
            )
        if item["choose"]:
            lines.append(m["item.choose.worksWith"] if w else m["item.choose"])
            for c in item["choose"]:
                lines.append(
                    fmt(m["group.item"], {"group": c["label"], "list": sep.join(s["text"] for s in c["services"])})
                )
        if item["notInGeorgia"]:
            lines.append(m["item.notInGeorgia.worksWith"] if w else m["item.notInGeorgia"])
            for s in item["notInGeorgia"]:
                lines.append(fmt(m["sub.item"], {"text": s["text"]}))
        if item["moneySkipped"]:
            lines.append(
                fmt(m["item.moneySkipped"], {"list": sep.join(s["name"] for s in item["moneySkipped"])})
            )
        if item["rest"] > 0:
            lines.append(fmt(m["item.rest.worksWith"] if w else m["item.rest"], {"count": item["rest"]}))
        lines.extend(item["warnings"])
        lines.append(fmt(m["item.access"], {"text": " ".join(item["access"])}))
        lines.extend(["", m["item.install"], ""])
        if item["install"]["commands"]:
            lines.extend([item["install"]["steps"][0], "", "```bash"])
            lines.extend(item["install"]["commands"])
            lines.append("```")
            for step in item["install"]["steps"][1:]:
                lines.extend(["", step])
        else:
            lines.extend(item["install"]["steps"])

    if result["overflow"]:
        lines.extend(
            [
                "",
                fmt(
                    m["overflow"],
                    {
                        "count": len(result["overflow"]),
                        "list": sep.join("`%s`" % n for n in result["overflowTitles"]),
                    },
                ),
            ]
        )
    if count > 0 and result["uncovered"]:
        lines.extend(["", fmt(m["uncovered"], {"list": "; ".join(result["uncovered"])})])
    if count > 0 and result["unconnected"]:
        lines.extend(["", fmt(m["unconnected"], {"list": sep.join(result["unconnected"])})])
    if result["excluded"]:
        lines.extend(["", m["excluded.title"], ""])
        lines.extend(item["text"] for item in result["excluded"])
    if result["hints"]:
        lines.extend(["", m["hints.title"], "", m["hints.intro"], ""])
        lines.extend(hint["text"] for hint in result["hints"])
    if result["georgianTools"]:
        lines.extend(["", m["tools.title"], "", m["tools.intro"], ""])
        lines.extend(tool["text"] for tool in result["georgianTools"])
    lines.extend(["", "---", ""])
    if count > 0 and result["surface"] not in COMMAND_SURFACES:
        lines.append(m["footer.remove.app"])
    if result["unknownShown"]:
        lines.append(m["footer.unknown"])
    lines.append(fmt(m["footer.report"], {"issues": result["issues"]}))
    return "\n".join(lines) + "\n"


# ---- questions -------------------------------------------------------------


def questions(catalog, messages, lang, role, surface):
    if lang not in ("ka", "en"):
        refuse("--lang: must be ka or en")
    tax = catalog["taxonomy"]
    if surface not in tax["surfaces"]:
        refuse("--surface: must be one of %s" % ", ".join(tax["surfaces"]))
    # The questions name the platform's owner, so they are worded for the surface they are asked on.
    platform = platform_of(catalog, surface)
    m = wording(messages, lang, platform, surface)
    if role is not None and not role.strip():
        refuse("--role: describe an activity")
    if role is not None and not any(r["id"] == role for r in tax["roles"]):
        role = "general"

    def option(item):
        return {"id": item["id"], "label": fmt(item["label"][lang], {"owner": platform["owner"]})}

    def question(qid, multi, options, other_choices):
        # A question with otherChoices takes a free answer too: "other" is the label to offer it under.
        return {
            "id": qid,
            "header": m["header." + qid],
            "text": m["question." + qid],
            "multi": multi,
            "options": options,
            "other": m["question.other"] if other_choices else None,
            "otherChoices": other_choices,
        }

    phrases = {}
    for key in m:
        if key.startswith("say."):
            phrases[key[4:]] = m[key]
    if role is None:
        return {
            "lang": lang,
            "round": 1,
            "questions": [
                question(
                    "role",
                    False,
                    [],
                    [option(r) for r in tax["roles"]],
                ),
                question(
                    "limits",
                    True,
                    [option(l) for l in tax["limits"]] + [{"id": "none", "label": m["question.none"]}],
                    [],
                ),
            ],
            "phrases": phrases,
        }
    return {
        "lang": lang,
        "round": 2,
        "questions": [
            question(
                "tasks",
                True,
                [option(t) for t in tax["tasks"] if t["role"] == role],
                [option(t) for t in tax["tasks"] if t["role"] != role],
            ),
            question(
                "uses",
                True,
                [{"id": "group:" + g["id"], "label": g["label"][lang]} for g in tax["groups"] if g["asked"]],
                [
                    {
                        "id": s["id"],
                        "label": "%s (%s)" % (s["name"], ", ".join(s["aliases"])) if s["aliases"] else s["name"],
                    }
                    for s in catalog["services"]
                ],
            ),
        ],
        "phrases": phrases,
    }


# ---- command line ----------------------------------------------------------


def parse_args(argv):
    args = {
        "answers": None,
        "format": "md",
        "catalog": None,
        "questions": False,
        "role": None,
        "lang": "ka",
        "surface": None,
    }
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--questions":
            args["questions"] = True
        elif arg in ("--answers", "--format", "--catalog", "--role", "--lang", "--surface"):
            if i + 1 >= len(argv):
                refuse("%s: needs a value\n%s" % (arg, USAGE))
            args[arg[2:]] = argv[i + 1]
            i += 1
        else:
            refuse("unknown argument %s\n%s" % (arg, USAGE))
        i += 1
    if args["format"] not in ("md", "json"):
        refuse("--format: must be md or json")
    if not args["questions"] and args["answers"] is None:
        refuse(USAGE)
    return args


def main(argv):
    args = parse_args(argv)
    catalog = read_json(args["catalog"] or os.path.join(HERE, "catalog.json"), "catalog")
    messages = read_json(os.path.join(HERE, "messages.json"), "messages")
    if args["questions"]:
        return dump(questions(catalog, messages, args["lang"], args["role"], args["surface"]))
    result = recommend(catalog, messages, read_json(args["answers"], "answers"))
    if args["format"] == "json":
        return dump(result)
    return render(result, catalog, messages)


if __name__ == "__main__":
    try:
        output = main(sys.argv[1:])
    except Refusal as error:
        sys.stderr.write("mrcheveli: %s\n" % error)
        sys.exit(2)
    sys.stdout.buffer.write(output.encode("utf-8"))
