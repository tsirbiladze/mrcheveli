# Rehearsing the skill

A rehearsal runs the whole skill, from the first look around to the hand-over, for a fictional
person, with nothing installed anywhere: an agent that has never seen the skill follows
`skills/mrcheveli/SKILL.md` while a stand-in answers in place of the `claude` or the `codex` command.

```bash
node tests/rehearsal/setup.mjs /tmp/rehearsal-1 --surface claude-code
node tests/rehearsal/setup.mjs /tmp/rehearsal-2 --surface claude-app
node tests/rehearsal/setup.mjs /tmp/rehearsal-3 --surface codex-cli --installed notion@openai-curated-remote --refuse gmail@openai-curated-remote
node tests/rehearsal/setup.mjs /tmp/rehearsal-4 --surface chatgpt-app
```

Each makes a folder holding a copy of the skill as people install it, an empty `work/` folder for
the agent, and `calls.log`. It prints the `PATH` to give the agent.

- `--surface claude-code`: `bin/claude` is the stand-in. It answers `--version`,
  `plugin list --json` (the plugins named by `--installed a@m,b@m`, or none),
  `plugin marketplace list --json`, `plugin marketplace add` and `plugin install`, installs
  nothing, and writes every call to `calls.log`. It remembers what it was told, so a marketplace
  that was added and a plugin that was "installed" are listed afterwards. Any other call fails.
  `bin/node` is the real one.
- `--surface claude-app`: `bin/` is empty, so the `PATH` holds neither `claude` nor `node`, as in
  the code sandbox of Claude's apps. The agent has to notice both and run the Python twin.
- `--surface codex-cli`: `bin/codex` is the stand-in. It answers `--version`,
  `plugin list --json` (the plugins named by `--installed`, or none) and `plugin add <id>`, which
  installs nothing and writes the id down, so that the plugin is listed afterwards. A plugin named
  by `--refuse` is refused with the message a read-only sandbox gives: that rehearses a failed
  install. Any other call fails: no marketplace is added and nothing is removed. `bin/node` is the
  real one.
- `--surface chatgpt-app`: `bin/` is empty, as for `claude-app`.

The rehearsals for `codex-cli` can be run by Codex itself (`codex exec`, in the rehearsal folder,
told to call `./bin/codex` wherever the skill says `codex`): then an OpenAI model follows the
skill, and only the plugin command is a stand-in.

`people/` holds the fictional people and their answers. Give the agent the folder, the `PATH`, one
person, and the person's first message; have it write what it would say to them in
`work/transcript.md`.

Afterwards:

```bash
node tests/rehearsal/check.mjs /tmp/rehearsal-1 --yes sales --no hubspot-sales
```

It passes when every call was one the skill allows, every plugin that got a yes was installed, and
nothing else was. A plugin the stand-in refused counts as installed here: the yes was acted on.
For `chatgpt-app` and `claude-app` give no `--yes`: there the skill installs nothing. What the agent wrote to the person is read by a human: the checker does not read
the transcript.

What a rehearsal cannot show: how the real `claude` command answers, what Claude's apps or the
ChatGPT app show a person on the Plugins page, and whether the person understands the answer. One real run with a real
person, before a release, does that.
