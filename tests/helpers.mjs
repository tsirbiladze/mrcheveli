// Shared by the tests: runs the two twins, and writes answers files to a temporary folder.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SCRIPTS = join(ROOT, 'skills', 'mrcheveli', 'scripts');
export const FIXTURE = join(ROOT, 'tests', 'fixtures', 'catalog.json');
export const REAL = join(SCRIPTS, 'catalog.json');
export const PYTHON = process.env.PYTHON || 'python3';

const work = mkdtempSync(join(tmpdir(), 'mrcheveli-test-'));
let counter = 0;

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

export function answersFile(answers) {
  counter += 1;
  const path = join(work, `answers-${counter}.json`);
  writeFileSync(path, typeof answers === 'string' ? answers : JSON.stringify(answers));
  return path;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export const node = (args) => run(process.execPath, [join(SCRIPTS, 'match.mjs'), ...args]);
export const python = (args) => run(PYTHON, [join(SCRIPTS, 'match.py'), ...args]);

/** Runs the Node twin on answers and returns the parsed JSON result. Throws when it refuses. */
export function match(answers, catalog = FIXTURE) {
  const result = node(['--answers', answersFile(answers), '--catalog', catalog, '--format', 'json']);
  if (result.status !== 0) throw new Error(`match refused: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

export function markdown(answers, catalog = FIXTURE) {
  const result = node(['--answers', answersFile(answers), '--catalog', catalog]);
  if (result.status !== 0) throw new Error(`match refused: ${result.stderr}`);
  return result.stdout;
}

export function refusal(answers, catalog = FIXTURE) {
  const result = node(['--answers', answersFile(answers), '--catalog', catalog]);
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

export const base = (over = {}) => ({
  lang: 'en',
  surface: 'claude-app',
  role: 'sales',
  tasks: ['sales.pipeline'],
  uses: [],
  limits: [],
  installed: [],
  ...over,
});

export const names = (result) => result.recommend.map((item) => item.name);
