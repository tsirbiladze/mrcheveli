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
| `role` | one role `id` from the first question |
| `tasks` | task `id`s from the third question. At least one, unless `uses` names a service |
| `uses` | from the fourth question: an option's `id` (such as `group:google`), or the `id` of a service the person named |
| `limits` | limit `id`s from the second question. No limits is `[]`, or `["none"]` alone |
| `installed` | plugin ids from step 1, as `name@marketplace` or just the name. Only the name counts, so `gmail@openai-curated-remote` is the plugin `gmail` |

Every `id` comes from the script's `--questions` output. `options` are the ready answers. `otherChoices` are what an answer in the person's own words may be matched to.

## What the questions output holds

`--questions --lang ka --surface <surface>` prints round 1, and the same with `--role <id>` prints round 2 only. Each has `questions` and `phrases`. The surface is needed because a question names the assistant's maker.

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
| `missing` | the person says `{name}` is not there or will not install: it counts as left out |
| `failed` | a command failed: `{text}` is its message, in a line or two. The way by hand is in the answer, under that plugin |
| `handover` | at the end: `{installed}` and `{skipped}` are names joined by commas, or the phrase `none`. A plugin whose install failed, or that the person could not find, goes under `{skipped}`. Where you install nothing yourself, `{installed}` holds what the person said they installed |

## Matching an answer in the person's own words

- **Close to an option, in other words.** "მხოლოდ ცნობილი კომპანიების პლაგინები მინდა" is the option about plugins published by Anthropic or by the service itself. Take it, and say so with `readback`. An answer that covers part of an option counts for that option: "CRM-ს მე ვავსებ" is the task about keeping the CRM tidy and forecasting. Look among the options of the person's own role first, and take a task of another role only when none of their own fits. An answer by an option's number, or in the label's exact words, needs no `readback`, and neither does a service the person calls by its exact name on the list ("Canva-ს და Slack-ს" are Canva and Slack). Every other matched answer gets one, services too: "Google-ის ფოსტა" is `gmail`, and you say so. A name written in Georgian letters ("ჰაბსპოტი") is not the exact name: read it back. An answer that means no limits needs no `readback`.
- **A role outside the four.** `otherChoices` of the first question holds three more: a small business owner, customer support, HR and operations. Someone who runs their own shop or firm is a small business owner. If none fits, ask which of the seven is closest.
- **A task outside the role's own.** `otherChoices` of the third question holds every other task, among them three that fit any role: email, calendar and tasks; finding information across company tools; viewing, filling and signing PDFs.
- **A service by name.** `otherChoices` of the fourth question lists every service the catalog knows, by `id` and name; some carry other names in brackets. Match by a name on that list and nothing else: "ჰაბსპოტი" and "Hubspot" are `hubspot`, and "Outlook და Teams" is `microsoft-365`, because both stand in its brackets. A service that is not on the list is not sent: say so with `unused`. Do not send its kind in its place: "ბუღალტერიისთვის 1C გვაქვს" names a program the catalog does not know, so nothing is sent for it.
- **Names instead of a kind.** This holds for every option of the fourth question. When the person names the services, send the names and not the option: "Gmail და Google-ის კალენდარი" is `gmail` and `google-calendar`, not `group:google`; "CRM-ად ჰაბსპოტი გვაქვს" is `hubspot`, not `group:crm`. The option is for a person who says the kind and not which one.
- **Only what they use now.** `uses` is for services the person works with today. One they used to use, or mean to start using, is not sent: say so with `notUsedNow`. This matters. A service that is sent is taken on the person's word that it works for them, so sending one they only plan to use would hide the catalog's warning that it does not work in Georgia.

Do not guess. An answer you cannot match to an `id` is not sent.

## What the script does with a named service

A service the person names is one they already use, so the script takes their word that it works for them. For every other service it applies the catalog's "works in Georgia" status: one that does not work in Georgia is listed under "do not connect" with its source, and one with no official source is marked "შეუმოწმებელია".
