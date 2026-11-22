# From what the person says to the answers file

## The answers file

One JSON object. The script refuses a wrong one in a single line that names the field, and leaves with code 2.

```json
{
  "lang": "ka",
  "surface": "claude-app",
  "role": "owner",
  "tasks": ["owner.money", "owner.marketing"],
  "uses": ["gmail", "google-drive", "canva"],
  "limits": ["known-publishers"],
  "installed": ["productivity@knowledge-work-plugins"]
}
```

| Field | What goes in it |
|---|---|
| `lang` | `ka` or `en`: the language of the answer. Left out, it is `ka` |
| `surface` | `claude-app`, `claude-code`, `chatgpt-app` or `codex-cli`, from step 1 |
| `role` | a role id or an activity description. Use `general` when passing an unlisted activity to the command line |
| `tasks` | task `id`s from the tasks question. At least one, unless `uses` names a service |
| `uses` | from the services question: an option's `id` (such as `group:google`), or the `id` of a service the person named |
| `limits` | limit `id`s from the limits question. No limits is `[]`, or `["none"]` alone |
| `installed` | plugin ids from step 1, as `name@marketplace` or just the name. Only the name counts, so `gmail@openai-curated-remote` is the plugin `gmail` |

Every `id` comes from the script's `--questions` output. `options` are the ready answers. `otherChoices` are what an answer in the person's own words may be matched to.

## What the questions output holds

`--questions --lang ka --surface <surface>` lists the activity and limits questions. Add `--role <id>` for the tasks and services questions. Each has `questions` and `phrases`. The surface is needed because a question names the assistant's maker.

`phrases` are the short sentences for your own messages, in the same language. Fill the blanks in braces and change nothing else.

| Phrase | When |
|---|---|
| `readback` | you matched an answer given in the person's own words: `{text}` is the label of what you took it for, or several labels joined by `; ` |
| `unused` | an answer matched nothing in the catalog: `{text}` is what they said |
| `notUsedNow` | they named a service they do not use now: `{text}` is its name. Where this and `unused` both fit, use this one |
| `askInstall` | on `claude-code` and `codex-cli`, before installing `{name}` |
| `askApp` | on `claude-app` and `chatgpt-app`, when it is `{name}`'s turn |
| `installed` | on `claude-code` and `codex-cli`, after an install that succeeded |
| `noted` | on `claude-app` and `chatgpt-app`, after the person says they installed `{name}` |
| `skipped` | after a plugin the person left out |
| `missing` | the person says `{name}` is not there or will not install: it counts as unfinished |
| `failed` | a command failed: `{text}` is a short, redacted description of the error. The way by hand is in the answer, under that plugin |
| `handover` | in a terminal, list successful installs and explicit declines. Fill `{installed}` and `{skipped}` with names or `none` |
| `handoverApp` | in an app, list only installs the person confirmed, and explicit declines. Use the same two placeholders |
| `unfinished` | append only if an install failed or the plugin could not be found. Fill `{list}` with those names |

## Matching an answer in the person's own words

- **Close to an option, in other words.** "მხოლოდ ცნობილი კომპანიების პლაგინები მინდა" is the option about plugins published by Anthropic or by the service itself. Take it, and say so with `readback`. An answer that covers part of an option counts for that option: "CRM-ს მე ვავსებ" is the task about keeping the CRM tidy and forecasting. Match each task across the whole catalog. If the wording leaves a material choice open, follow the clarification rule in step 2. Use a readback after the meaning is settled. An answer by an option's number, or in the label's exact words, needs no `readback`, and neither does a service the person calls by its exact name on the list ("Canva-ს და Slack-ს" are Canva and Slack). Every other matched answer gets one, services too: "Google-ის ფოსტა" is `gmail`, and you say so. A name written in Georgian letters ("ჰაბსპოტი") is not the exact name: read it back. An answer that means no limits needs no `readback`.
- **An activity in the person's own words.** The activity question has no ready answers. Use a specific role id only for a clear match. Use `general` for any other activity, several activities together, or a personal project. Keep the person's description in the conversation. Do not read back the internal label or infer tasks from a job title.
- **Tasks from any activity.** The task options are examples. The tasks question lists the remaining matches in `otherChoices`. A teacher making lesson slides can use `general.slides`; someone comparing survey results can use `general.analysis`. For a task with no match, include `general.other` once and use `unused` to name each unmatched task in the person's own words, even if a named service gets its own recommendation. If the person has only described their occupation, ask what they want help with first.
- **A service by name.** `otherChoices` of the services question lists every service the catalog knows, by `id` and name; some carry other names in brackets. Match by a name on that list and nothing else: "ჰაბსპოტი" and "Hubspot" are `hubspot`, and "Outlook და Teams" is `microsoft-365`, because both stand in its brackets. A service that is not on the list is not sent: say so with `unused`. Do not send its kind in its place: "ბუღალტერიისთვის 1C გვაქვს" names a program the catalog does not know, so nothing is sent for it.
- **Names instead of a kind.** This holds for every option of the services question. When the person names the services, send the names and not the option: "Gmail და Google-ის კალენდარი" is `gmail` and `google-calendar`, not `group:google`; "CRM-ად ჰაბსპოტი გვაქვს" is `hubspot`, not `group:crm`. The option is for a person who says the kind and not which one.
- **Only what they use now.** `uses` is for services the person works with today. One they used to use, or mean to start using, is not sent: say so with `notUsedNow`. This matters. A service that is sent is taken on the person's word that it works for them, so sending one they only plan to use would hide the catalog's warning that it does not work in Georgia.

For example, “I teach, I use Canva and I am working on survey results” leaves the next task open. Ask “What remains to be done with the results?” If they want to compare responses, use `general.analysis`. If they want slides, use `general.slides`. If they want both, keep both. Someone who already said “the analysis is done, I only need slides” has settled that question.

Use catalog ids for tasks, services and limits. Pass a role id such as `general` to the command line. The person's free-text activity can also be recorded in the JSON file.

## What the script does with a named service

A service the person names is one they already use, so the script takes their word that it works for them. For every other service it applies the catalog's "works in Georgia" status: one that does not work in Georgia is listed under "do not connect" with its source, and one with no official source is marked "შეუმოწმებელია".
