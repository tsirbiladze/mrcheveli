# mrcheveli

An agent skill that tells a person in Georgia which plugins are worth installing for their work, in Claude or in ChatGPT, and the catalog it chooses from. `SPEC.md` says what it must do: read it first. `tests/rehearsal/README.md` says how the whole skill is rehearsed.

## Rules

- **Nothing is published or installed without the owner's yes.** No GitHub repository, push, release or npm publish, and no plugin, connector or skill installed on the owner's accounts or machine. A rehearsal runs against the stand-in for `claude` or `codex`, never the real command. The one install on the owner's account so far, a trial of `codex plugin add` that was removed again, had his yes for that one install.
- **The script chooses, the model carries.** What is recommended, in what order, and every fact about it comes out of `match.mjs`. A rule that changes the choice goes into the script and its tests, never into `SKILL.md` as advice.
- **The twins stay identical.** `match.py` prints the same bytes as `match.mjs` for the same input, on standard output and on standard error (`tests/twin.test.mjs`). A change to one is a change to both.
- **A status is never a guess.** "Works in Georgia" is `yes`, `partial` or `no` only with an official page, a quote that is on that page, and the date. Anything else is `unknown`. A country list must be about countries: "Georgia" in a list of US states is not evidence.
- **Our own words.** `what` in `catalog/plugins.json` and every note are written here. A plugin's own description, a marketplace's text and a quote from a vendor's page do not ship in the skill and do not reach the model as instructions (`tests/catalog.test.mjs`).
- **Commands come from the catalog's names only.** The install commands are built from a plugin name and a marketplace the build has checked against a fixed pattern. No other text reaches a command line.
- **A plugin outside a public repository enters the catalog only from its own page**, as the owner shows it by screenshot. `catalog/directory.json` holds what the page says, the date it was seen and how. Nothing is added to it from memory, from a listing of names, or from a plugin's files on someone's machine, and what the page does not show, such as the number of skills, stays unknown.
- **Each platform its own plugins.** A plugin belongs to Claude or to ChatGPT through its marketplace, and a person on one is never recommended a plugin of the other. In the two apps the skill installs nothing and prints no command; in Claude Code and in Codex in a terminal it prints the command and runs it on a yes.
- **Wording that names the assistant is filled in, not written.** `{assistant}` and `{owner}` in a message become the platform's names, and a message that differs between the platforms has a second form under `key@chatgpt` (`tests/match.test.mjs`).
- **A Georgian tool is "reviewed" only when its code was read**, at the commit and on the date the entry names. Until then it is "listed", and the skill never installs either kind.
- **Every claim in a document is one a test or a run stands behind.** A number in the README or a page text is checked against the catalog (`tests/docs.test.mjs`). A version of Node.js or Python, an agent or a surface is named as tried only after it was.
- **Synthetic people only.** The people in `tests/rehearsal/people/` are fictional and say so.

## Working with the owner

Write to the owner in Georgian, as „შენ“, in a few short sentences, and ask their decisions with ready answers, the recommended one first.

## Commands

```bash
npm test             # everything below except the network checks (node --test, no dependencies)
npm run build        # catalog/ -> skills/mrcheveli/scripts/catalog.json
npm run check        # is the committed catalog what catalog/ gives?
npm run snapshot     # network: read the plugins upstream again into catalog/upstream.json
npm run upstream     # network: has a plugin of the catalog changed upstream? writes nothing
npm run sources      # network: is every status's quote still on its page? add: -- --reader https://r.jina.ai/
node tests/rehearsal/setup.mjs <new folder> --surface claude-code   # a rehearsal folder; also claude-app, chatgpt-app, codex-cli
```

## Changing the catalog

1. A plugin: add or change its entry in `catalog/plugins.json`, under the marketplace it comes from, run `npm run snapshot`, then `npm run build`. The build refuses a connector it knows no service for: add the service to `catalog/services.json` with its status, or `unknown`. A plugin that only ChatGPT's directory holds has no snapshot: write its page down in `catalog/directory.json` from the owner's screenshot, and give its entry the marketplace `openai-curated-remote`.
2. A status: change `georgia` in `catalog/services.json`, with the page, the quote and today's date, then `npm run sources -- <id>` and `npm run build`.
3. `npm test`. The numbers in `README.md`, `README.ka.md` and the two page texts in `docs/` are checked against the catalog, so a change in the catalog shows there as a failing test.

When the skill's behaviour changes, the two page texts in `docs/` change with it: they have no H1, use absolute links, hold no install command (the site draws its own install box), and say the same thing in both languages.

## Release

1. Bump the version in `skills/mrcheveli/SKILL.md`, `package.json`, `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`, and add the `CHANGELOG.md` entry. `npm run build` puts it into the catalog.
2. `npm run upstream`, `npm run sources`, `npm test`.
3. One rehearsal on each surface, and one real run by the owner.
4. Commit and tag `vX.Y.Z`. Publishing is the owner's step.
