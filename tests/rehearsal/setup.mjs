#!/usr/bin/env node
// Makes a folder for one rehearsal of the skill: a copy of the skill as people install it, and a
// stand-in for the `claude` or the `codex` command that installs nothing and writes down every call.
//
//   node tests/rehearsal/setup.mjs <new folder> [--surface <surface>] [--installed a@m,b@m] [--refuse a@m]
//
// --refuse names plugins the codex stand-in will not install, as a sandbox or an administrator would.
//
// The surfaces are claude-code, claude-app, codex-cli and chatgpt-app. It prints the PATH to give
// the agent. On claude-app and chatgpt-app the PATH holds no `claude`, no `codex` and no `node`,
// as in a chat's own sandbox, so the agent has to find the Python twin.

import { chmodSync, cpSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const value = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const target = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : null;
const surface = value('--surface', 'claude-code');
const SURFACES = ['claude-code', 'claude-app', 'codex-cli', 'chatgpt-app'];
if (!target || existsSync(target) || !SURFACES.includes(surface)) {
  process.stderr.write(`usage: setup.mjs <new folder> [--surface ${SURFACES.join('|')}] [--installed a@m,b@m] [--refuse a@m]\n`);
  process.exit(1);
}
const installed = value('--installed', '').split(',').filter(Boolean);
const refused = value('--refuse', '').split(',').filter(Boolean);

mkdirSync(join(target, 'bin'), { recursive: true });
mkdirSync(join(target, 'work'));
cpSync(join(ROOT, 'skills', 'mrcheveli'), join(target, 'skill'), { recursive: true });
writeFileSync(join(target, 'calls.log'), '');

if (surface === 'claude-code') {
  // The stand-in remembers what it was told: a marketplace that was added is listed afterwards,
  // and so is a plugin that was "installed".
  const state = join(target, 'state');
  mkdirSync(state);
  writeFileSync(join(state, 'plugins'), installed.map((id) => `${id}\n`).join(''));
  writeFileSync(join(state, 'marketplaces'), '');
  const script = `#!/bin/sh
# A stand-in for the claude command. It installs nothing and writes down every call.
printf '%s\\n' "claude $*" >> '${join(target, 'calls.log')}'
state='${state}'
list() {
  printf '['
  first=1
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    [ "$first" = 1 ] || printf ','
    first=0
    printf '%s' "$(printf "$1" "$id")"
  done < "$2"
  printf ']\\n'
}
case "$*" in
  "--version") echo "2.1.325 (Claude Code)" ;;
  "plugin list --json") list '{"id":"%s","version":"1.0.0","scope":"user","enabled":true,"installPath":"/stand-in"}' "$state/plugins" ;;
  "plugin marketplace list --json") list '{"name":"%s","source":"github"}' "$state/marketplaces" ;;
  "plugin marketplace add anthropics/knowledge-work-plugins")
    grep -qx knowledge-work-plugins "$state/marketplaces" || echo knowledge-work-plugins >> "$state/marketplaces"
    echo "Successfully added marketplace: knowledge-work-plugins" ;;
  "plugin install "*)
    if grep -qx "$3" "$state/plugins"; then echo "Plugin \\"$3\\" is already installed (scope: user)"
    else echo "$3" >> "$state/plugins"; echo "Successfully installed plugin: $3 (scope: user)"; fi ;;
  *) echo "stand-in: this call is not part of the skill" >&2; exit 1 ;;
esac
`;
  writeFileSync(join(target, 'bin', 'claude'), script);
  chmodSync(join(target, 'bin', 'claude'), 0o755);
  symlinkSync(process.execPath, join(target, 'bin', 'node'));
}

if (surface === 'codex-cli') {
  // The stand-in lists what is installed, and "installs" by writing the plugin's id down: a
  // plugin that was added is listed afterwards. One named by --refuse is refused, with the
  // message a read-only sandbox gives. Any other call fails.
  const row = (id) => {
    const [name, market] = id.split('@');
    return { pluginId: id, name, marketplaceName: market || 'openai-curated-remote', version: '1.0.0', installed: true, enabled: true };
  };
  const state = join(target, 'plugins.json');
  writeFileSync(state, JSON.stringify({ installed: installed.map(row), available: [] }, null, 2) + '\n');
  const script = `#!${process.execPath}
// A stand-in for the codex command. It installs nothing and writes down every call.
import fs from 'node:fs';
const args = process.argv.slice(2);
const call = args.join(' ');
fs.appendFileSync(${JSON.stringify(join(target, 'calls.log'))}, 'codex ' + call + '\\n');
const state = ${JSON.stringify(state)};
const refused = ${JSON.stringify(refused)};
const row = ${row.toString()};
if (call === '--version') console.log('codex-cli 0.169.0');
else if (call === 'plugin list --json') process.stdout.write(fs.readFileSync(state, 'utf8'));
else if (args.length === 3 && args[0] === 'plugin' && args[1] === 'add' && /^[a-z0-9][a-z0-9-]*@[a-z0-9-]+$/.test(args[2])) {
  if (refused.includes(args[2])) {
    console.error('Error: install remote plugin bundle: failed to create remote plugin bundle extraction directory: Read-only file system (os error 30)');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(state, 'utf8'));
  if (!data.installed.some((p) => p.pluginId === args[2])) data.installed.push(row(args[2]));
  fs.writeFileSync(state, JSON.stringify(data, null, 2) + '\\n');
  console.log('stand-in: ' + args[2] + ' is written down as installed');
} else {
  console.error('stand-in: this call is not part of the skill');
  process.exit(1);
}
`;
  writeFileSync(join(target, 'bin', 'codex'), script);
  chmodSync(join(target, 'bin', 'codex'), 0o755);
  symlinkSync(process.execPath, join(target, 'bin', 'node'));
}

process.stdout.write(
  [
    `rehearsal folder: ${target}`,
    `skill:            ${join(target, 'skill')}`,
    `working folder:   ${join(target, 'work')}`,
    `PATH for the agent: ${join(target, 'bin')}:/usr/bin:/bin`,
    '',
  ].join('\n'),
);
