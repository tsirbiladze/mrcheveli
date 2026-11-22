# Changelog

## 0.2.0 — 2026-11-22

Describe any activity in your own words. Recommendations follow the tasks and services you name, including lesson slides, data analysis, code review and web app development. If the catalog has no match, the skill tells you.

## 0.1.0 — 2026-11-19

First version. Not released.

- The skill: five steps, from seeing where it runs to the hand-over. Four questions in two rounds, worded by the script in Georgian or English. A plugin is installed only on a yes given for that plugin; in Claude's apps and in the ChatGPT app the skill leads to the button and installs nothing.
- Two platforms, four surfaces: Claude's apps and Claude Code; the ChatGPT app and Codex in a terminal. A person is recommended only the plugins of the assistant they are using, called by the name its directory shows. In Codex in a terminal the skill runs one command for each yes, `codex plugin add`, with the id the directory lists the plugin under; the way by hand is printed beside it.
- `match.mjs` makes the choice from the answers and the catalog: at most five plugins, each with the tasks it covers, its publisher, what it holds, which connectors to connect, which do not work in Georgia and why, and how to install it. `match.py` is its twin for Claude's apps and prints the same bytes.
- The catalog: plugins from `anthropics/knowledge-work-plugins` for Claude and from `openai/plugins` for ChatGPT, each pinned to a commit and described in our own words, and the services they connect to, each with a "works in Georgia" status. OpenAI's Sales plugin, which only ChatGPT's directory holds, is in the catalog from its page as the owner showed it: the answer says which services it works with, that their plugins are installed separately, and that the catalog does not know how many skills it holds. The rest of that directory is not in the catalog, and an answer in ChatGPT says so when nothing fits. A status other than "unknown" carries an official page, a quote that is on it and the date.
- A short list of tools made for Georgian services (rs.ge, a bank, the National Bank's rates, Georgian law, Georgian grammar). None was reviewed; the skill names them and never installs them.
- Rehearsed eleven times by agents that had never seen it, for eight fictional people, against a stand-in for the `claude` or the `codex` command: six for Claude, three as Codex in a terminal by Codex itself, two as the ChatGPT app by Claude agents. On a real account only the Codex install command was tried, once, for one plugin that was removed again.
- `build.mjs` refuses a plugin that left the marketplace, moved to another GitHub owner or lost its pinned commit, a plugin from a directory without the date its page was seen, a connector with no known service, and a status without its evidence. `snapshot.mjs` and `sources.mjs` check the plugins upstream and every status against its page.
