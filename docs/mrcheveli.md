---
title: The /mrcheveli Skill
summary: Four questions about your work, then at most five plugins for Claude or ChatGPT and the connectors worth connecting, without the services that do not work in Georgia.
category: Plugins
status: experimental
source: https://github.com/tsirbiladze/mrcheveli/blob/main/skills/mrcheveli/SKILL.md
---

## What it does

`mrcheveli` tells you which plugins are worth installing for your work, in Claude or in ChatGPT. It asks four questions: what you mostly do, what limits you have, what you do most often, and which services you already use. Then it recommends at most five plugins, and for each one it says which connectors to connect, which to leave alone, and how to install it.

Describe your work, studies or hobby in your own words. A teacher can ask for help making slides, a researcher for help analysing survey results. It recommends only the plugins of the assistant you are talking to: Claude's to a person in Claude, ChatGPT's to a person in ChatGPT. A role plugin is a bundle: Anthropic's `small-business` plugin holds 44 skills and connectors to 35 services, and nothing on the Plugins page says which of those services a business registered in Georgia can open an account with. By each service's own published list, 8 of the 35 it cannot: Airwallex, Gusto, MYOB, Ramp, RingCentral, Square, Stripe and TikTok Ads. `mrcheveli` tells you that before you connect anything, with a link to the page that shows it.

The choice is made by a script, not by the model. The same answers always give the same list, and every fact in it comes from a catalog that ships with the skill: the publisher, what the plugin holds, the status of each service.

## When to reach for it

- You have Claude or ChatGPT and have never added a plugin, and the Plugins page shows you hundreds.
- You installed a role plugin and it offers thirty connectors: which ones are yours?
- You work in Georgia and want to know, before signing up, whether a service a plugin leans on is sold here at all.
- You set Claude or ChatGPT up for a colleague who is an accountant, a lawyer or in sales, and want a short list to start from.

It is not a search engine for plugins. It chooses from its own catalog of 61 plugins, 37 for Claude and 24 for ChatGPT, and tells you when nothing in it fits.

## What you get

For each recommended plugin:

- **What it is and why you**: the tasks of yours it covers, and the services you named that it uses.
- **Who publishes it**: Anthropic or OpenAI, the service itself, or a third party.
- **What it holds**: how many skills and how many connectors.
- **Connect**: the connectors for services you said you use.
- **Pick the ones you use**: connectors of a kind you use, when you did not say which.
- **Does not work in Georgia, do not connect**: each with the reason and the official page.
- **Access**: what the plugin can read, whether it can write in your name, whether it touches money, whether it runs anything on your computer.
- **How to install**: the steps to the button in Claude's apps and in the ChatGPT app, or the commands it will run on your yes in Claude Code and in Codex.

Below the list: what was left out and why, services that have a plugin of their own, and tools made for Georgian services.

| | |
|---|---|
| Plugins | 61 |
| for Claude | 37 |
| for ChatGPT | 24 |
| of them by Anthropic | 13 |
| of them by OpenAI | 11 |
| of them by the service itself | 35 |
| of them by a third party | 2 |
| Services | 98 |
| work in Georgia | 35 |
| work in part | 2 |
| do not work in Georgia | 8 |
| no official source in the catalog | 53 |
| Georgian tools listed | 7 |
| Georgian tools reviewed | 0 |

## How it goes

1. **See.** The skill finds out where it runs and which plugins you already have, without asking you.
2. **Ask.** Four questions in two rounds, each with ready answers. You can answer in your own words.
3. **Choose.** The script picks at most five plugins and sorts every connector of each.
4. **Install.** Each plugin waits for your yes. In Claude's apps and in the ChatGPT app the skill installs nothing: it gives you the steps, and you press the button. In Claude Code it runs two commands, and in Codex in a terminal one, each shown to you first. Connecting a service is always yours, with your own account.
5. **Hand over.** What was installed, how to remove it, and the date of the catalog.

## It's working if

- It asks you four questions and no more, in Georgian.
- It recommends five plugins or fewer, and says so when none fits.
- Every service it tells you not to connect comes with a link to that service's own page.
- A service it could not check says „შეუმოწმებელია“, not "works".
- It asks before every install, one plugin at a time, and never asks for a password.
- The answer ends with the date of the catalog.

## Limits

- **Two marketplaces, and not all of either.** For Claude, plugins from [`anthropics/knowledge-work-plugins`](https://github.com/anthropics/knowledge-work-plugins): sales, accounting and finance, marketing, legal work, small business, customer support, HR, operations, data analysis and software engineering. For ChatGPT, 23 of the 65 plugins in OpenAI's public repository, [`openai/plugins`](https://github.com/openai/plugins): three bundles for data analysis, marketing visuals and web app development, and plugins for single services. The connectors directory is outside the catalog.
- **In ChatGPT the catalog is thin.** The directory inside ChatGPT holds far more than OpenAI's public repository. One plugin from it is in the catalog, OpenAI's Sales, written down from its page as it was seen on 2026-11-19: the catalog knows which services it works with and not how many skills it holds, and the answer says so. The plugins of most of those services, HubSpot's among them, are in the directory and not in the catalog. A person in accounting or legal work who asks in ChatGPT may be told that nothing in the catalog fits.
- **"Works in Georgia" is about signing up and paying.** It says nothing about the Georgian language, Georgian tax rules or local prices. A status stands on an official page and a quote from it; where the catalog holds no official statement, because none was found or none has been looked for yet, the answer says „შეუმოწმებელია“, and that is 53 of the 98 services.
- **A "yes" can be thin.** For some services it rests on a list of the countries the service excludes, without Georgia on it. That shows the service does not rule Georgia out, not that every part of it works here.
- **A paid plan, in Claude's apps.** Plugins from Anthropic's directory are shown on the Pro, Max, Ultra, Team and Enterprise plans.
- **A catalog has a date.** Plugins change and services open in new countries. The date is printed with every answer.
- **Georgian tools are named, not vouched for.** Tools for rs.ge, a bank, the National Bank's rates, Georgian law and Georgian grammar are listed when they fit your tasks. None has been reviewed, and the skill never installs them.
- **Barely tried with a real account.** This version was rehearsed by agents against a stand-in that installs nothing. For Codex in a terminal the agent was Codex itself. On a real account only the Codex install command was tried, once, for one plugin that was removed again. The skill has not been run in Claude's apps or in the ChatGPT app with a real account, in a real Claude Code session, or with a person who is not a developer.
