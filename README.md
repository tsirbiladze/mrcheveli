# mrcheveli

**An agent skill that tells you which plugins are worth installing for your work, in Claude or in ChatGPT, and leaves out the services that do not work in Georgia.** It asks four questions, then recommends at most five plugins. For each one it says which connectors to connect, which to skip because the service behind them cannot be used from Georgia, and how to install it. Made for people in Georgia who work with Claude or ChatGPT and are not developers. It speaks Georgian by default.

[Skill page](https://tsirbiladze.com/skills/mrcheveli) · [ქართულად](README.ka.md) · [Changelog](CHANGELOG.md) · MIT

> The install commands below use the `main` branch. Version 0.1.0 has no release tag yet.

## Why

A role plugin is a bundle. Anthropic's `small-business` plugin holds 44 skills and connectors to 35 services. The Plugins page does not say which of those services a business registered in Georgia can open an account with. By each service's own published list, 8 of the 35 it cannot: Airwallex, Gusto, MYOB, Ramp, RingCentral, Square, Stripe and TikTok Ads. For 2 more, Shopify and Wix, the store works and the service's own payments do not.

mrcheveli knows that, with the page that shows it, and tells you before you connect anything.

## Install

Pick one.

<details open>
<summary><b>Claude's apps</b> (chat, the desktop app, Cowork)</summary>

Open **Customize > Plugins**, choose **Add marketplace**, enter `tsirbiladze/mrcheveli`, and install `mrcheveli`. Skills need **Code execution and file creation** turned on under Settings > Capabilities.

Then ask: *"რომელი პლაგინები დავაყენო ჩემი სამუშაოსთვის?"*
</details>

<details>
<summary><b>Claude Code</b></summary>

```
/plugin marketplace add tsirbiladze/mrcheveli
/plugin install mrcheveli@mrcheveli
```
</details>

<details>
<summary><b>ChatGPT and Codex</b> (the ChatGPT desktop app, Codex in a terminal)</summary>

```bash
codex plugin marketplace add tsirbiladze/mrcheveli
```

In Codex, install the skill with `codex plugin add mrcheveli@mrcheveli`. Start a new chat and ask *"Which plugins should I install for my work?"*

In the ChatGPT desktop app, open **Plugins**, choose the Mrcheveli marketplace and install `mrcheveli`. Installation through the app is untested.
</details>

<details>
<summary><b>Any agent that reads the Agent Skills format</b></summary>

```bash
npx skills@latest add tsirbiladze/mrcheveli
```
</details>

The skill's script is one file that runs on Node.js, or on Python through `scripts/match.py`. It needs no network and installs no packages.

## What you get

An answer like this one, for a shop owner who uses Google and Canva (shortened):

```markdown
## 1. small-business

- **რატომ შენთვის:** ხშირად გიწევს: ფული: ინვოისები, ხარჯები, გადახდები. იყენებ: Canva
- **ვინ გამოსცემს:** Anthropic (Anthropic-ის გამოშვებული)
- **რას შეიცავს:** 44 სკილი, 35 კონექტორი
- **დააკავშირე:** Canva
- **აირჩიე, რომლებსაც იყენებ:**
  - Google: Gmail, Google Calendar, Google Drive
- **საქართველოში არ მუშაობს, ნუ დააკავშირებ:**
  - Stripe: საქართველო არ არის იმ ქვეყნებს შორის, სადაც ბიზნესს Stripe-ის ანგარიშის გახსნა შეუძლია. [წყარო](https://stripe.com/global)
  - Square: Square ბარათით გადახდას მხოლოდ რვა ქვეყნის ბიზნესისთვის იღებს და საქართველო მათ შორის არ არის. [წყარო](https://squareup.com/help/us/en/article/5085-accepted-cards)
- **ახლა არ გჭირდება:** დანარჩენი კონექტორები (23). პლაგინის დაყენება მათ არ აკავშირებს.
```

The same answers always give the same list: the choice is made by a script, not by the model.

## What it knows

The catalog ships inside the skill. Its date is printed with every answer.

| | |
|---|---|
| Plugins | 58 |
| for Claude | 35 |
| for ChatGPT | 23 |
| of them by Anthropic | 11 |
| of them by OpenAI | 10 |
| of them by the service itself | 35 |
| of them by a third party | 2 |
| Services | 95 |
| work in Georgia | 35 |
| work in part | 2 |
| do not work in Georgia | 8 |
| no official source in the catalog | 50 |
| Georgian tools listed | 7 |
| Georgian tools reviewed | 0 |

The plugins come from two public marketplaces, each plugin pinned to a commit: [`anthropics/knowledge-work-plugins`](https://github.com/anthropics/knowledge-work-plugins) for Claude, and [`openai/plugins`](https://github.com/openai/plugins) for ChatGPT and Codex. One more plugin is in neither: OpenAI's Sales, which only the directory inside ChatGPT holds. It is written down from its page there, as it was seen on 2026-11-19: the catalog knows which services it works with and not how many skills it holds, and the answer says so. All are described in the catalog's own words, in Georgian and English. You are recommended only the plugins of the assistant you are using.

**"Works in Georgia"** means: a person or a business in Georgia can sign up for the service, pay for it and use it. Every status except "no official source" stands on an official page of the service, a quote that is on that page, and the date it was checked. A status is never a guess: where the catalog holds no official statement, because none was found or none has been looked for yet, the answer says „შეუმოწმებელია“. A service you say you already use is taken at your word.

**Georgian tools** (rs.ge, a bank, the National Bank's rates, Georgian law, Georgian grammar) exist on GitHub and in no official catalog. The skill names the ones that fit your tasks, in a separate list, and never installs them. Nobody has reviewed their code for this version, and the list says so.

## How it goes

1. **See**: where it runs, and which plugins you already have.
2. **Ask**: four questions in two rounds. What you mostly do; what limits you have; what you do most often; which services you already use.
3. **Choose**: the script picks at most five plugins and sorts each one's connectors.
4. **Install**, on your yes for each plugin. In Claude's apps and in the ChatGPT app the skill installs nothing: it gives the steps to the button, and you press it. In Claude Code it runs two commands, and in Codex in a terminal one, each printed before it is run. Connecting a service is always yours, with your own account.
5. **Hand over**: what was installed, how to remove it, the catalog's date.

## Limits

Two marketplaces. From Anthropic's, the plugins for sales, accounting and finance, marketing, legal work, small business, customer support, HR and operations. From OpenAI's public repository, 22 plugins of the 65 in it: two bundles, for data analysis and for marketing visuals, and plugins for single services; and 1 more that only ChatGPT's directory holds, OpenAI's Sales, described from its page. The directory inside ChatGPT holds far more than that. The Sales plugin works with the plugins of 38 services, and most of those plugins, HubSpot's among them, are in the directory and not in the catalog: the answer names the service and says its plugin has not been assessed. No developer plugins, no connectors directory. Four surfaces: Claude's apps, Claude Code, the ChatGPT app and Codex in a terminal. In Claude's apps, plugins from Anthropic's directory are shown on paid plans. "Works in Georgia" is about signing up and paying: it says nothing about the Georgian language, Georgian tax rules or local prices. No Georgian tool has been reviewed. The catalog is as old as its date.

## In this repository

| Path | What it is |
|---|---|
| `skills/mrcheveli/` | The skill as it is installed: `SKILL.md` (the five steps), `references/answers.md`, and `scripts/`: `match.mjs`, its twin `match.py`, the catalog and the texts |
| `catalog/` | The catalog's sources, written by hand, and three scripts: `build.mjs` makes the skill's catalog from them, `snapshot.mjs` reads the plugins upstream, `sources.mjs` checks every status against its page |
| `docs/` | The text of the skill's page on tsirbiladze.com, in English and Georgian |
| `tests/` | The tests, and `tests/rehearsal/`: the whole skill run for a fictional person against a stand-in for the `claude` or the `codex` command |
| `SPEC.md`, `AGENTS.md` | What the skill must do, and the rules for working on it |

## How it is tested

- 109 tests (`npm test`): the choice on a synthetic catalog, the refusals of a wrong answers file, the catalog build and what it refuses, the shipped catalog's own rules, the skill folder, and these documents' numbers against the catalog.
- The two twins, `match.mjs` and `match.py`, are run on the same inputs and must print the same bytes: on the synthetic catalog, and on the shipped one for every role, both languages and all four surfaces.
- Every status with a source was checked against its page on 2026-11-19: all 43 quotes were found (`node catalog/sources.mjs`), 12 of them through a page reader because the page refuses a plain request or is a PDF.
- Six rehearsals in three rounds by agents that had never seen the skill: three as Claude Code and three as Claude's app, for four fictional people, against a stand-in for the `claude` command that installs nothing. In all six the agent asked the four questions, showed the script's answer, and installed only the plugins that got a yes. In one, the agent ran a listing command of its own to check an install; the skill now forbids it. What the agents found unclear was fixed after each round. The changes made after the last round are covered by tests and were not rehearsed again.
- Four more rehearsals for OpenAI's side, in two rounds, for three fictional people. The two as Codex in a terminal were run by Codex itself (`codex exec`, Codex CLI 0.169.0), with only its plugin command replaced by a stand-in: it asked the four questions, showed the script's answer with the steps to `/plugins`, and ran nothing that installs, as the skill then required. The two as the ChatGPT app were played by Claude agents told that they were ChatGPT, because the app cannot be driven from a script: they show that the instructions can be followed, not how ChatGPT follows them. The first round found ten faults, among them a question that named Anthropic to a person in ChatGPT, plugins called by their ids and not by the names the directory shows, and a count of connectors that did not add up. They were fixed before the second round. What the second round found was wording, and the changes made after it are covered by tests and were not rehearsed again.
- One more rehearsal after the skill learned to install in Codex, again by Codex itself, for a fictional sales manager who uses HubSpot, Gmail and Slack. It asked the four questions, showed the answer with OpenAI's Sales plugin first, and asked before each of the three plugins. It ran the install command for the two that got a yes and nothing for the one that got a no, and when the stand-in refused one, it said so and tried no other way. What it found unclear was fixed afterwards: what to do when it cannot ask for approval, where a failed plugin goes in the hand-over, and how a person can check the page a plugin is described from. Those changes are covered by tests and were not rehearsed again.
- On a real account, once, with the owner's yes: `codex plugin add` and `codex plugin remove` for one plugin, on 2026-11-19. Both worked with the id the directory lists.

The public GitHub install worked in clean Codex CLI and Claude Code profiles on Linux. In both profiles the installed script recommended Sales first for a salesperson using HubSpot and Gmail.

Tried on Node.js 24 and Python 3.14, on Linux.

Not yet seen: a run in Claude's apps or in the ChatGPT app with a real account, a real Claude Code conversation, the Codex install command for Sales and for the two plugins the directory lists under an app's id, a person who is not a developer reading the answer, Node.js 22, Python 3.9, macOS, Windows.

```bash
npm test          # no dependencies, no network
npm run sources   # network: every status against its page
npm run upstream  # network: has a plugin of the catalog changed?
```

Every person in the tests and the examples is fictional.

## License

MIT
