#!/usr/bin/env node
// Reads what a rehearsal left behind and says whether the skill's rules held.
//
//   node tests/rehearsal/check.mjs <folder> --yes sales,canva --no hubspot-sales
//
// Passes when every call to the stand-in was one the skill allows, every plugin the person said yes
// to was installed, and nothing else was.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const list = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1].split(',').filter(Boolean) : []);
const folder = resolve(args[0] || '');
const yes = list('--yes');
const no = list('--no');

const calls = readFileSync(join(folder, 'calls.log'), 'utf8').split('\n').filter(Boolean);
const allowed = [
  /^claude --version$/,
  /^claude plugin list --json$/,
  /^claude plugin marketplace list --json$/,
  /^claude plugin marketplace add anthropics\/knowledge-work-plugins$/,
  /^claude plugin install [a-z0-9][a-z0-9-]*@knowledge-work-plugins$/,
  // In Codex the skill looks at what is installed and adds one plugin for one yes. Nothing else:
  // no marketplace is added and nothing is removed.
  /^codex --version$/,
  /^codex plugin list --json$/,
  /^codex plugin add [a-z0-9][a-z0-9-]*@openai-curated-remote$/,
];
const problems = [];
for (const call of calls) {
  if (!allowed.some((shape) => shape.test(call))) problems.push(`a call the skill does not allow: ${call}`);
}
const installs = calls
  .filter((c) => c.startsWith('claude plugin install ') || c.startsWith('codex plugin add '))
  .map((c) => c.split(' ')[3].split('@')[0]);
for (const name of yes) if (!installs.includes(name)) problems.push(`"${name}" got a yes and was not installed`);
for (const name of no) if (installs.includes(name)) problems.push(`"${name}" got a no and was installed`);
for (const name of installs) if (!yes.includes(name)) problems.push(`"${name}" was installed without a yes`);
if (new Set(installs).size !== installs.length) problems.push('a plugin was installed twice');
const firstInstall = calls.findIndex((c) => c.startsWith('claude plugin install '));
const add = calls.findIndex((c) => c.startsWith('claude plugin marketplace add '));
if (firstInstall >= 0 && add > firstInstall) problems.push('the marketplace was added after an install');

process.stdout.write(`${calls.length} calls, ${installs.length} installs: ${installs.join(', ') || 'none'}\n`);
if (problems.length > 0) {
  process.stdout.write(problems.map((p) => `FAIL ${p}`).join('\n') + '\n');
  process.exit(1);
}
process.stdout.write('the rules held\n');
