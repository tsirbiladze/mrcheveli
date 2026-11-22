#!/usr/bin/env node
// mrcheveli: picks plugins from the catalog for one person's answers.
// No network, no dependencies. match.py is its twin and must print the same bytes.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const INSTALL_RE = /^[a-z0-9][a-z0-9-]{0,63}@[a-z0-9][a-z0-9-]{0,63}$/;
// The surfaces where the skill runs the install command itself, on the person's yes.
const COMMAND_SURFACES = ['claude-code', 'codex-cli'];
const MAX_RECOMMEND = 5;
const MAX_HINTS = 4;
const TIER_RANK = { anthropic: 0, openai: 0, partner: 1, 'third-party': 2 };
const USAGE = `usage:
  match.mjs --answers <file> [--format md|json] [--catalog <file>]
  match.mjs --questions --surface <surface> [--role <activity>] [--lang ka|en] [--catalog <file>]`;

class Refusal extends Error {}

function refuse(message) {
  throw new Refusal(message);
}

function readJson(path, what) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    refuse(`${what}: cannot read ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    refuse(`${what}: ${path} is not valid JSON`);
  }
}

function fmt(template, vars) {
  let out = template;
  for (const key of Object.keys(vars)) {
    out = out.split(`{${key}}`).join(String(vars[key]));
  }
  return out;
}

function byId(list) {
  const map = new Map();
  for (const item of list) map.set(item.id, item);
  return map;
}

function isStringList(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function unique(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

// ---- platforms -------------------------------------------------------------

// A surface belongs to one platform: Claude or ChatGPT. The catalog's plugins, the steps to
// install them and some of the wording differ between the two.
function platformOf(catalog, surface) {
  for (const platform of catalog.taxonomy.platforms) {
    if (platform.surfaces.includes(surface)) return platform;
  }
  return refuse(`catalog: surface ${surface} belongs to no platform`);
}

// The messages of one language as one platform says them: a key that ends in "@<platform>"
// takes the place of the plain key, and {assistant} and {owner} become the platform's names.
function wording(messages, lang, platform, surface) {
  const base = messages[lang];
  const suffix = `@${platform.id}`;
  const out = {};
  for (const key of Object.keys(base)) {
    if (!key.includes('@')) out[key] = base[key];
  }
  for (const key of Object.keys(base)) {
    if (key.endsWith(suffix)) out[key.slice(0, key.length - suffix.length)] = base[key];
  }
  for (const key of Object.keys(out)) {
    out[key] = fmt(out[key], { assistant: platform.assistant[surface], owner: platform.owner });
  }
  return out;
}

// ---- answers ---------------------------------------------------------------

function normalize(answers, catalog) {
  const tax = catalog.taxonomy;
  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
    refuse('answers: must be a JSON object');
  }
  const known = ['lang', 'surface', 'role', 'tasks', 'uses', 'limits', 'installed'];
  for (const key of Object.keys(answers)) {
    if (!known.includes(key)) refuse(`answers.${key}: unknown field. Fields: ${known.join(', ')}`);
  }
  const lang = answers.lang === undefined ? 'ka' : answers.lang;
  if (lang !== 'ka' && lang !== 'en') refuse('answers.lang: must be "ka" or "en"');

  const surface = answers.surface;
  if (!tax.surfaces.includes(surface)) {
    refuse(`answers.surface: must be one of ${tax.surfaces.join(', ')}`);
  }
  if (typeof answers.role !== 'string' || answers.role.trim() === '') refuse('answers.role: describe an activity');
  for (const key of ['tasks', 'uses', 'limits', 'installed']) {
    if (answers[key] !== undefined && !isStringList(answers[key])) {
      refuse(`answers.${key}: must be a list of strings`);
    }
  }
  const tasks = unique(answers.tasks || []);
  const taskIds = tax.tasks.map((t) => t.id);
  for (const task of tasks) {
    if (!taskIds.includes(task)) refuse(`answers.tasks: unknown task "${task}"`);
  }
  let limits = unique(answers.limits || []);
  if (limits.includes('none')) {
    if (limits.length > 1) refuse('answers.limits: "none" cannot stand beside another limit');
    limits = [];
  }
  const limitIds = tax.limits.map((l) => l.id);
  for (const limit of limits) {
    if (!limitIds.includes(limit)) {
      refuse(`answers.limits: unknown limit "${limit}". One of: ${limitIds.join(', ')}`);
    }
  }
  const services = byId(catalog.services);
  const groups = byId(tax.groups);
  const direct = [];
  const usedGroups = [];
  for (const use of unique(answers.uses || [])) {
    if (use.startsWith('group:')) {
      const group = groups.get(use.slice(6));
      if (!group) refuse(`answers.uses: unknown group "${use}"`);
      usedGroups.push(group.id);
      for (const also of group.also || []) usedGroups.push(also);
    } else if (services.has(use)) {
      direct.push(use);
    } else {
      refuse(`answers.uses: unknown service "${use}". Run with --questions to list them`);
    }
  }
  if (tasks.length === 0 && direct.length === 0) {
    refuse('answers.tasks: give at least one task, or name a service in answers.uses');
  }
  const installed = unique((answers.installed || []).map((id) => id.split('@')[0]));
  return { lang, surface, tasks, limits, direct, usedGroups: unique(usedGroups), installed };
}

// ---- the choice ------------------------------------------------------------

function label(item, lang) {
  return item.label[lang];
}

// A group's short name where it has one: the long label is the wording of the question.
function groupName(group, lang) {
  return (group.short || group.label)[lang];
}

// A service the person named is one they already use: its status is only said when the catalog
// holds that it does not work in Georgia. A service they have not named gets its status in full.
function serviceView(service, lang, m, named) {
  const g = service.georgia;
  let text = service.name;
  if (named) {
    if (g.status === 'no') text = fmt(m['flag.usedNo'], { name: service.name });
  } else if (g.status === 'partial') {
    text = fmt(m['flag.partial'], { name: service.name, note: g.note[lang] });
  } else if (g.status === 'unknown') {
    text = fmt(m['flag.unknown'], { name: service.name });
  }
  return { id: service.id, name: service.name, georgia: g.status, text };
}

function installSteps(plugin, catalog, surface, toConnect, m) {
  const market = catalog.marketplaces[plugin.marketplace];
  if (!market) refuse(`catalog: marketplace of ${plugin.id} is not allowed`);
  // Every command below is built from these names and nothing else.
  if (!NAME_RE.test(plugin.name) || !NAME_RE.test(plugin.marketplace) || !INSTALL_RE.test(plugin.install)) {
    refuse(`catalog: ${plugin.id} is not a safe plugin name`);
  }
  if (surface === 'codex-cli') {
    // One command, and the way by hand for when it refuses.
    return {
      surface,
      steps: [
        m['cli.intro'],
        [m['cli.new']]
          .concat(toConnect.length > 0 ? [m['cli.signin']] : [])
          .concat([fmt(m['cli.remove'], { remove: `codex plugin remove ${plugin.install}` })])
          .join(' '),
        fmt(m['cli.manual'], { title: plugin.title }),
      ],
      commands: [`codex plugin add ${plugin.install}`],
    };
  }
  if (surface === 'chatgpt-app') {
    return {
      surface,
      steps: [
        m['chat.step.open'],
        fmt(m['chat.step.find'], { title: plugin.title }),
        m['chat.step.install'],
        toConnect.length === 0 ? m['chat.step.noConnect'] : m['chat.step.connect'],
        m['chat.step.new'],
      ],
      commands: [],
    };
  }
  if (!REPO_RE.test(market.repo || '')) refuse(`catalog: marketplace of ${plugin.id} is not allowed`);
  if (surface === 'claude-code') {
    return {
      surface,
      steps: [
        m['code.intro'],
        [m['code.reload']]
          .concat(toConnect.length > 0 ? [m['code.signin']] : [])
          .concat([fmt(m['code.remove'], { remove: `claude plugin uninstall ${plugin.install}` })])
          .join(' '),
      ],
      commands: [`claude plugin marketplace add ${market.repo}`, `claude plugin install ${plugin.install}`],
    };
  }
  return {
    surface,
    steps: [
      m['app.step.open'],
      fmt(m['app.step.find'], { name: plugin.name, repo: market.repo }),
      m['app.step.install'],
      toConnect.length === 0
        ? m['app.step.noConnect']
        : plugin.connectors === 0
          ? fmt(m['app.step.connectDirectory'], { list: toConnect.join(m['list.and']) })
          : m['app.step.connect'],
    ],
    commands: [],
  };
}

function recommend(catalog, messages, answers) {
  const a = normalize(answers, catalog);
  const platform = platformOf(catalog, a.surface);
  const m = wording(messages, a.lang, platform, a.surface);
  const tax = catalog.taxonomy;
  const services = byId(catalog.services);
  const groups = byId(tax.groups);
  const tasks = byId(tax.tasks);
  const tiers = byId(tax.tiers);
  const sep = m['list.and'];

  // A plugin is installed when the person's list holds its name, or another id it goes by.
  const isInstalled = (plugin) => a.installed.includes(plugin.name) || plugin.aka.some((id) => a.installed.includes(id));

  const candidates = [];
  const excluded = [];
  const hints = [];
  const covered = new Set();

  for (const plugin of catalog.plugins) {
    if (!plugin.surfaces.includes(a.surface)) continue;
    const taskHits = a.tasks.filter((t) => plugin.tasks.includes(t));
    const requiredDirect = plugin.requires.filter((s) => a.direct.includes(s));
    const requiredGroup = plugin.requires.filter((s) => a.usedGroups.includes(services.get(s).group));
    let relevant = taskHits.length > 0 || requiredDirect.length > 0;
    if (plugin.kind === 'service' && requiredDirect.length === 0) {
      relevant = false;
      hints.push({ plugin, service: services.get(plugin.requires[0]), byGroup: requiredGroup.length > 0, taskHits });
    }
    if (!relevant) continue;
    // A task is covered once a plugin for it was considered, also one left out below with its reason.
    for (const task of taskHits) covered.add(task);

    const name = plugin.name;
    if (isInstalled(plugin)) {
      excluded.push({ id: plugin.id, name, reason: 'installed', text: fmt(m['excluded.installed'], { name: plugin.title }) });
      continue;
    }
    if (a.limits.includes('known-publishers') && plugin.tier === 'third-party') {
      excluded.push({
        id: plugin.id,
        name,
        reason: 'known-publishers',
        text: fmt(m['excluded.known-publishers'], { name: plugin.title, publisher: plugin.publisher }),
      });
      continue;
    }
    if (a.limits.includes('no-money') && plugin.money) {
      excluded.push({ id: plugin.id, name, reason: 'no-money', text: fmt(m['excluded.no-money'], { name: plugin.title }) });
      continue;
    }

    const optional = plugin.services.filter(
      (s) => a.direct.includes(s) || a.usedGroups.includes(services.get(s).group),
    );
    const score =
      3 * taskHits.length +
      (requiredDirect.length > 0 ? 4 : 0) +
      Math.min(2, optional.length) +
      (plugin.tier === platform.tier ? 1 : 0);
    candidates.push({ plugin, taskHits, score });
  }

  // Role plugins come before plugins for one service, so that a bundle is read before the
  // narrower plugin that adds to it.
  candidates.sort((x, y) => {
    const kind = (x.plugin.kind === 'service' ? 1 : 0) - (y.plugin.kind === 'service' ? 1 : 0);
    if (kind !== 0) return kind;
    if (x.score !== y.score) return y.score - x.score;
    const tier = TIER_RANK[x.plugin.tier] - TIER_RANK[y.plugin.tier];
    if (tier !== 0) return tier;
    return x.plugin.id < y.plugin.id ? -1 : x.plugin.id > y.plugin.id ? 1 : 0;
  });

  // A plugin that is one connector and no skill adds nothing beside a bundle that holds the same
  // connector: it is left out, with that reason. A bundle that works with other plugins holds no
  // connector of its own, so beside it the service's plugin is what does the connecting.
  const chosen = [];
  const overflow = [];
  const overflowTitles = [];
  for (const candidate of candidates) {
    const plugin = candidate.plugin;
    if (plugin.kind === 'service' && plugin.skills === 0) {
      const bundle = chosen.find(
        (c) => c.plugin.kind !== 'service' && !c.plugin.worksWith && c.plugin.services.includes(plugin.requires[0]),
      );
      if (bundle) {
        excluded.push({
          id: plugin.id,
          name: plugin.name,
          reason: 'in-bundle',
          text: fmt(m['excluded.in-bundle'], {
            name: plugin.title,
            bundle: bundle.plugin.title,
            service: services.get(plugin.requires[0]).name,
          }),
        });
        continue;
      }
    }
    if (chosen.length < MAX_RECOMMEND) chosen.push(candidate);
    else {
      overflow.push(plugin.name);
      overflowTitles.push(plugin.title);
    }
  }

  const items = chosen.map(({ plugin, taskHits, score }) => {
    const connect = [];
    const chooseByGroup = new Map();
    const notInGeorgia = [];
    const moneySkipped = [];
    let rest = 0;
    for (const sid of plugin.services) {
      const service = services.get(sid);
      const g = service.georgia;
      const named = a.direct.includes(sid);
      if (g.status === 'no' && !named) {
        notInGeorgia.push({
          id: service.id,
          name: service.name,
          text: fmt(m['flag.no'], { name: service.name, note: g.note[a.lang], source: g.source }),
        });
      } else if (a.limits.includes('no-money') && service.money) {
        moneySkipped.push({ id: service.id, name: service.name });
      } else if (named) {
        connect.push(serviceView(service, a.lang, m, true));
      } else if (a.usedGroups.includes(service.group)) {
        if (!chooseByGroup.has(service.group)) chooseByGroup.set(service.group, []);
        chooseByGroup.get(service.group).push(serviceView(service, a.lang, m, false));
      } else {
        rest += 1;
      }
    }
    const choose = [];
    for (const [groupId, list] of chooseByGroup) {
      choose.push({ group: groupId, label: groupName(groups.get(groupId), a.lang), services: list });
    }

    const why = [];
    if (taskHits.length > 0) {
      why.push(fmt(m['why.task'], { label: taskHits.map((t) => label(tasks.get(t), a.lang)).join('; ') }));
    }
    const usedNames = connect.map((s) => s.name);
    for (const sid of plugin.requires) {
      const service = services.get(sid);
      if (a.direct.includes(sid) && !usedNames.includes(service.name)) usedNames.push(service.name);
    }
    if (usedNames.length > 0) why.push(fmt(m['why.uses'], { list: usedNames.join(sep) }));

    const warnings = [];
    for (const sid of plugin.requires) {
      const service = services.get(sid);
      const g = service.georgia;
      if (g.status === 'no') {
        warnings.push(fmt(m['requires.no'], { name: service.name, note: g.note[a.lang], source: g.source }));
      }
      if (g.status === 'partial') {
        warnings.push(fmt(m['requires.partial'], { name: service.name, note: g.note[a.lang] }));
      }
    }

    const access = plugin.access.map((flag) => m[`access.${flag}`]);
    access.push(plugin.worksWith ? m['access.worksWith'] : plugin.services.length > 0 ? m['access.none'] : m['access.noConnector']);

    // A plugin for one service, beside a role plugin that holds the same connector: say what it adds.
    let overlap = '';
    if (plugin.kind === 'service') {
      const beside = chosen.filter((c) => c.plugin.kind !== 'service' && c.plugin.services.includes(plugin.requires[0]));
      const bundle = beside.find((c) => !c.plugin.worksWith);
      const user = beside.find((c) => c.plugin.worksWith);
      const service = services.get(plugin.requires[0]).name;
      if (bundle) overlap = fmt(m['item.overlap'], { bundle: bundle.plugin.title, service, skills: plugin.skills });
      else if (user) overlap = fmt(m['item.overlap.worksWith'], { bundle: user.plugin.title, service });
    }

    return {
      id: plugin.id,
      name: plugin.name,
      title: plugin.title,
      marketplace: plugin.marketplace,
      publisher: plugin.publisher,
      tier: plugin.tier,
      tierLabel: fmt(label(tiers.get(plugin.tier), a.lang), { owner: platform.owner }),
      score,
      what: plugin.what[a.lang],
      why,
      skills: plugin.skills,
      connectors: plugin.connectors,
      worksWith: plugin.worksWith,
      seen: plugin.source.seen || '',
      overlap,
      connect,
      choose,
      notInGeorgia,
      moneySkipped,
      rest,
      warnings,
      access,
      install: installSteps(
        plugin,
        catalog,
        a.surface,
        connect.map((s) => s.name).concat(choose.map((c) => c.label)),
        m,
      ),
    };
  });

  const uncovered = a.tasks.filter((t) => !covered.has(t));

  // A service's own plugin is mentioned when the person said they use a tool of its kind, or when
  // it is the only kind of plugin there is for a task of theirs.
  hints.sort((x, y) => (x.plugin.id < y.plugin.id ? -1 : x.plugin.id > y.plugin.id ? 1 : 0));
  const hintItems = hints
    .filter((h) => h.byGroup || h.taskHits.some((t) => uncovered.includes(t)))
    .filter((h) => !isInstalled(h.plugin))
    .filter((h) => h.service.georgia.status !== 'no')
    .filter((h) => !(a.limits.includes('known-publishers') && h.plugin.tier === 'third-party'))
    .filter((h) => !(a.limits.includes('no-money') && h.plugin.money))
    .slice(0, MAX_HINTS)
    .map((h) => {
      const view = serviceView(h.service, a.lang, m, false);
      return {
        plugin: h.plugin.name,
        service: h.service.name,
        georgia: h.service.georgia.status,
        text: fmt(m['hints.item'], { service: view.text, name: h.plugin.title }),
      };
    });

  const tools = catalog.georgianTools
    .filter((tool) => tool.tasks.some((t) => a.tasks.includes(t)))
    .filter((tool) => !(a.limits.includes('no-money') && tool.money))
    .filter(() => !a.limits.includes('known-publishers'))
    .map((tool) => {
      const status =
        tool.status === 'reviewed'
          ? fmt(m['tools.reviewed'], { date: tool.reviewed.date, sha: tool.reviewed.sha.slice(0, 10) })
          : m['tools.listed'];
      return {
        id: tool.id,
        name: tool.name,
        status: tool.status,
        url: tool.url,
        text: fmt(m['tools.item'], { name: tool.name, status, what: tool.what[a.lang], url: tool.url }),
      };
    });

  const notes = [];
  if (a.limits.includes('managed')) notes.push(COMMAND_SURFACES.includes(a.surface) ? m['managed.code'] : m['managed.app']);

  // A service the person named that no chosen plugin connects to is said, not dropped. One whose
  // own plugin they already have installed is not among them.
  const connected = new Set();
  for (const plugin of catalog.plugins) {
    if (excluded.some((e) => e.id === plugin.id && e.reason === 'installed')) {
      for (const sid of plugin.requires) connected.add(sid);
    }
  }
  for (const item of items) {
    for (const s of item.connect) connected.add(s.id);
    for (const s of item.moneySkipped) connected.add(s.id);
  }
  const unconnected = a.direct.filter((sid) => !connected.has(sid)).map((sid) => services.get(sid).name);

  const unknownShown =
    hintItems.some((h) => h.georgia === 'unknown') ||
    items.some((item) => item.choose.some((c) => c.services.some((s) => s.georgia === 'unknown')));

  return {
    catalog: { version: catalog.version, generated: catalog.generated },
    lang: a.lang,
    surface: a.surface,
    recommend: items,
    excluded,
    overflow,
    overflowTitles,
    uncovered: uncovered.map((t) => label(tasks.get(t), a.lang)),
    unconnected,
    hints: hintItems,
    georgianTools: tools,
    notes,
    unknownShown,
    issues: catalog.issues,
  };
}

// ---- Markdown --------------------------------------------------------------

function render(result, catalog, messages) {
  const m = wording(messages, result.lang, platformOf(catalog, result.surface), result.surface);
  const sep = m['list.and'];
  const lines = [m['title'], ''];
  const count = result.recommend.length;
  lines.push(
    count > 0
      ? fmt(m['intro.some'], { date: result.catalog.generated, count })
      : fmt(m['intro.none'], { date: result.catalog.generated }),
  );
  if (count > 0) lines.push('', m['glossary']);
  for (const note of result.notes) lines.push('', note);

  result.recommend.forEach((item, index) => {
    lines.push('', `## ${index + 1}. ${item.title}`, '');
    lines.push(fmt(m['item.what'], { text: item.what }));
    lines.push(fmt(m['item.why'], { text: item.why.join('. ') }));
    lines.push(fmt(m['item.publisher'], { publisher: item.publisher, tier: item.tierLabel }));
    // A plugin that works with other plugins says so wherever a bundle speaks of its connectors.
    const w = item.worksWith;
    lines.push(
      w
        ? fmt(m['item.contains.worksWith'], { connectors: item.connectors })
        : item.connectors === 0
          ? fmt(m['item.contains.noConnectors'], { skills: item.skills })
          : item.skills === 0
            ? fmt(m['item.contains.noSkills'], { connectors: item.connectors })
            : fmt(m['item.contains'], { skills: item.skills, connectors: item.connectors }),
    );
    if (item.seen !== '') lines.push(fmt(m['item.seen'], { date: item.seen }));
    if (item.overlap !== '') lines.push(item.overlap);
    if (item.connect.length > 0) {
      lines.push(fmt(w ? m['item.connect.worksWith'] : m['item.connect'], { list: item.connect.map((s) => s.text).join(sep) }));
    }
    if (item.choose.length > 0) {
      lines.push(w ? m['item.choose.worksWith'] : m['item.choose']);
      for (const c of item.choose) {
        lines.push(fmt(m['group.item'], { group: c.label, list: c.services.map((s) => s.text).join(sep) }));
      }
    }
    if (item.notInGeorgia.length > 0) {
      lines.push(w ? m['item.notInGeorgia.worksWith'] : m['item.notInGeorgia']);
      for (const s of item.notInGeorgia) lines.push(fmt(m['sub.item'], { text: s.text }));
    }
    if (item.moneySkipped.length > 0) {
      lines.push(fmt(m['item.moneySkipped'], { list: item.moneySkipped.map((s) => s.name).join(sep) }));
    }
    if (item.rest > 0) lines.push(fmt(w ? m['item.rest.worksWith'] : m['item.rest'], { count: item.rest }));
    for (const warning of item.warnings) lines.push(warning);
    lines.push(fmt(m['item.access'], { text: item.access.join(' ') }));
    lines.push('', m['item.install'], '');
    if (item.install.commands.length > 0) {
      lines.push(item.install.steps[0], '', '```bash');
      for (const command of item.install.commands) lines.push(command);
      lines.push('```');
      for (const step of item.install.steps.slice(1)) lines.push('', step);
    } else {
      for (const step of item.install.steps) lines.push(step);
    }
  });

  if (result.overflow.length > 0) {
    lines.push(
      '',
      fmt(m['overflow'], {
        count: result.overflow.length,
        list: result.overflowTitles.map((n) => `\`${n}\``).join(sep),
      }),
    );
  }
  if (count > 0 && result.uncovered.length > 0) {
    lines.push('', fmt(m['uncovered'], { list: result.uncovered.join('; ') }));
  }
  if (count > 0 && result.unconnected.length > 0) {
    lines.push('', fmt(m['unconnected'], { list: result.unconnected.join(sep) }));
  }
  if (result.excluded.length > 0) {
    lines.push('', m['excluded.title'], '');
    for (const item of result.excluded) lines.push(item.text);
  }
  if (result.hints.length > 0) {
    lines.push('', m['hints.title'], '', m['hints.intro'], '');
    for (const hint of result.hints) lines.push(hint.text);
  }
  if (result.georgianTools.length > 0) {
    lines.push('', m['tools.title'], '', m['tools.intro'], '');
    for (const tool of result.georgianTools) lines.push(tool.text);
  }
  lines.push('', '---', '');
  if (count > 0 && !COMMAND_SURFACES.includes(result.surface)) lines.push(m['footer.remove.app']);
  if (result.unknownShown) lines.push(m['footer.unknown']);
  lines.push(fmt(m['footer.report'], { issues: result.issues }));
  return lines.join('\n') + '\n';
}

// ---- questions -------------------------------------------------------------

function questions(catalog, messages, lang, role, surface) {
  if (lang !== 'ka' && lang !== 'en') refuse('--lang: must be ka or en');
  const tax = catalog.taxonomy;
  if (!tax.surfaces.includes(surface)) refuse(`--surface: must be one of ${tax.surfaces.join(', ')}`);
  // The questions name the platform's owner, so they are worded for the surface they are asked on.
  const platform = platformOf(catalog, surface);
  const m = wording(messages, lang, platform, surface);
  if (role !== null && role.trim() === '') refuse('--role: describe an activity');
  if (role !== null && !tax.roles.some((r) => r.id === role)) role = 'general';
  const option = (item) => ({ id: item.id, label: fmt(item.label[lang], { owner: platform.owner }) });
  // A question with otherChoices takes a free answer too: "other" is the label to offer it under.
  const question = (id, multi, options, otherChoices) => ({
    id,
    header: m[`header.${id}`],
    text: m[`question.${id}`],
    multi,
    options,
    other: otherChoices.length > 0 ? m['question.other'] : null,
    otherChoices,
  });
  const phrases = {};
  for (const key of Object.keys(m)) {
    if (key.startsWith('say.')) phrases[key.slice(4)] = m[key];
  }
  if (role === null) {
    return {
      lang,
      round: 1,
      questions: [
        question('role', false, [], tax.roles.map(option)),
        question('limits', true, tax.limits.map(option).concat([{ id: 'none', label: m['question.none'] }]), []),
      ],
      phrases,
    };
  }
  return {
    lang,
    round: 2,
    questions: [
      question('tasks', true, tax.tasks.filter((t) => t.role === role).map(option), tax.tasks.filter((t) => t.role !== role).map(option)),
      question(
        'uses',
        true,
        tax.groups.filter((g) => g.asked).map((g) => ({ id: `group:${g.id}`, label: g.label[lang] })),
        catalog.services.map((s) => ({
          id: s.id,
          label: s.aliases.length > 0 ? `${s.name} (${s.aliases.join(', ')})` : s.name,
        })),
      ),
    ],
    phrases,
  };
}

// ---- command line ----------------------------------------------------------

function parseArgs(argv) {
  const args = { answers: null, format: 'md', catalog: null, questions: false, role: null, lang: 'ka', surface: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--questions') args.questions = true;
    else if (['--answers', '--format', '--catalog', '--role', '--lang', '--surface'].includes(arg)) {
      if (i + 1 >= argv.length) refuse(`${arg}: needs a value\n${USAGE}`);
      args[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else refuse(`unknown argument ${arg}\n${USAGE}`);
  }
  if (args.format !== 'md' && args.format !== 'json') refuse('--format: must be md or json');
  if (!args.questions && args.answers === null) refuse(USAGE);
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const catalog = readJson(args.catalog || join(HERE, 'catalog.json'), 'catalog');
  const messages = readJson(join(HERE, 'messages.json'), 'messages');
  if (args.questions) {
    return JSON.stringify(questions(catalog, messages, args.lang, args.role, args.surface), null, 2) + '\n';
  }
  const result = recommend(catalog, messages, readJson(args.answers, 'answers'));
  if (args.format === 'json') return JSON.stringify(result, null, 2) + '\n';
  return render(result, catalog, messages);
}

try {
  process.stdout.write(main(process.argv.slice(2)));
} catch (error) {
  if (error instanceof Refusal) {
    process.stderr.write(`mrcheveli: ${error.message}\n`);
    process.exit(2);
  }
  throw error;
}
