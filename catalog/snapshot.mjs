#!/usr/bin/env node
// Reads the upstream marketplace and writes catalog/upstream.json: for every plugin named in
// catalog/plugins.json, where it comes from and what it holds (skills, connectors, agents, hooks).
// Needs the network, git and tar. Nothing from upstream is executed; only JSON files are parsed
// and folders counted, inside a temporary folder that is deleted afterwards.
//
//   node catalog/snapshot.mjs            writes catalog/upstream.json
//   node catalog/snapshot.mjs --check    exits 1 and prints what changed, writes nothing

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'upstream.json');
const SHA_RE = /^[0-9a-f]{40}$/;
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const MAX_TARBALL = 300 * 1024 * 1024;

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

function fail(message) {
  process.stderr.write(`snapshot: ${message}\n`);
  process.exit(1);
}

function githubRepo(url) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(url || '');
  return match ? match[1] : null;
}

function headCommit(repo) {
  const out = execFileSync('git', ['ls-remote', `https://github.com/${repo}.git`, 'HEAD'], { encoding: 'utf8' });
  const sha = out.split(/\s+/)[0];
  if (!SHA_RE.test(sha)) fail(`could not read the HEAD commit of ${repo}`);
  return sha;
}

async function download(repo, sha, dir) {
  if (!REPO_RE.test(repo) || !SHA_RE.test(sha)) fail(`refusing to fetch ${repo}@${sha}`);
  const response = await fetch(`https://codeload.github.com/${repo}/tar.gz/${sha}`);
  if (!response.ok) fail(`${repo}@${sha.slice(0, 10)}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_TARBALL) fail(`${repo}: archive is larger than ${MAX_TARBALL} bytes`);
  const archive = join(dir, 'archive.tgz');
  const target = join(dir, 'tree');
  mkdirSync(target);
  writeFileSync(archive, bytes);
  execFileSync('tar', ['-xzf', archive, '-C', target, '--strip-components=1', '--no-same-owner']);
  return target;
}

function countSkills(root) {
  const skillsDir = join(root, 'skills');
  let skills = 0;
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      if (existsSync(join(skillsDir, name, 'SKILL.md'))) skills += 1;
    }
  }
  return skills;
}

function splitServers(servers) {
  const remote = [];
  const local = [];
  for (const key of Object.keys(servers)) {
    const server = servers[key] || {};
    if (typeof server.command === 'string') local.push(key);
    else remote.push({ key, url: typeof server.url === 'string' ? server.url : '' });
  }
  return { remote, local };
}

// A plugin of Anthropic's marketplace: connectors are the remote MCP servers it declares.
function describe(root) {
  if (!existsSync(root) || !statSync(root).isDirectory()) return null;
  let servers = {};
  const mcpFile = join(root, '.mcp.json');
  if (existsSync(mcpFile)) servers = read(mcpFile).mcpServers || {};
  for (const manifest of [join(root, '.claude-plugin', 'plugin.json'), join(root, 'plugin.json')]) {
    if (!existsSync(manifest)) continue;
    const inline = read(manifest).mcpServers;
    if (inline && typeof inline === 'object') servers = { ...inline, ...servers };
  }
  const { remote, local } = splitServers(servers);
  return {
    skills: countSkills(root),
    connectors: remote,
    localServers: local,
    agents: existsSync(join(root, 'agents')),
    hooks: existsSync(join(root, 'hooks')),
    bin: existsSync(join(root, 'bin')),
  };
}

// A plugin of OpenAI's marketplace: connectors are the apps in .app.json, or, where it names
// none, the remote MCP servers in .mcp.json. Its agents/ folder holds interface settings, not
// agents, so it is not counted as one.
function describeCodex(root) {
  if (!existsSync(root) || !statSync(root).isDirectory()) return null;
  const manifestFile = [join(root, '.codex-plugin', 'plugin.json'), join(root, 'plugin.json')].find((f) => existsSync(f));
  if (!manifestFile) return null;
  const manifest = read(manifestFile);
  const face = manifest.interface || (((manifest.extensions || {})['com.openai'] || {}).interface) || {};
  let apps = {};
  const appFile = join(root, '.app.json');
  if (existsSync(appFile)) apps = read(appFile).apps || {};
  let servers = {};
  const mcpFile = [join(root, '.mcp.json'), join(root, 'mcp.json')].find((f) => existsSync(f));
  if (mcpFile) servers = read(mcpFile).mcpServers || {};
  const { remote, local } = splitServers(servers);
  const appKeys = Object.keys(apps);
  return {
    author: typeof face.developerName === 'string' ? face.developerName : '',
    title: typeof face.displayName === 'string' ? face.displayName : '',
    skills: countSkills(root),
    connectors: appKeys.length > 0 ? appKeys.map((key) => ({ key, url: '' })) : remote,
    localServers: local,
    agents: false,
    hooks: existsSync(join(root, 'hooks')),
    bin: false,
  };
}

async function snapshot() {
  const marketplaces = read(join(HERE, 'marketplaces.json'));
  const wanted = read(join(HERE, 'plugins.json')).plugins;
  const work = mkdtempSync(join(tmpdir(), 'mrcheveli-'));
  const out = { marketplaces: {}, plugins: {} };
  try {
    const trees = new Map();
    const tree = async (repo, sha) => {
      const key = `${repo}@${sha}`;
      if (!trees.has(key)) {
        const dir = join(work, String(trees.size));
        mkdirSync(dir);
        trees.set(key, await download(repo, sha, dir));
      }
      return trees.get(key);
    };

    for (const [name, market] of Object.entries(marketplaces)) {
      // A directory has no repository to read: its plugins are written down by hand, in directory.json.
      if (market.format === 'directory') continue;
      const commit = headCommit(market.repo);
      const root = await tree(market.repo, commit);
      const codex = market.format === 'codex';
      const manifest = read(codex ? join(root, '.agents', 'plugins', 'marketplace.json') : join(root, '.claude-plugin', 'marketplace.json'));
      if (manifest.name !== name) fail(`${market.repo} calls itself "${manifest.name}", not "${name}"`);
      out.marketplaces[name] = { repo: market.repo, commit, plugins: manifest.plugins.length };

      for (const plugin of wanted.filter((p) => p.marketplace === name)) {
        const entry = manifest.plugins.find((p) => p.name === plugin.name);
        if (!entry) {
          out.plugins[plugin.id] = { missing: true };
          continue;
        }
        if (codex) {
          const local = typeof entry.source === 'string' ? entry.source : entry.source && entry.source.source === 'local' ? entry.source.path : null;
          if (typeof local !== 'string') fail(`${plugin.id}: only a plugin kept inside ${market.repo} can be in the catalog`);
          const path = local.replace(/^\.\//, '').replace(/\/$/, '');
          if (path.split('/').includes('..')) fail(`${plugin.id}: source path leaves the repository`);
          const facts = describeCodex(join(root, path));
          if (!facts) fail(`${plugin.id}: nothing at ${market.repo}/${path}`);
          const { author, title, ...rest } = facts;
          out.plugins[plugin.id] = { source: { repo: market.repo, path, sha: commit }, author, title, ...rest };
          continue;
        }
        let source;
        let facts;
        if (typeof entry.source === 'string') {
          const path = entry.source.replace(/^\.\//, '').replace(/\/$/, '');
          source = { repo: market.repo, path, sha: commit };
          facts = describe(join(root, path));
        } else {
          const repo = entry.source.repo || githubRepo(entry.source.url);
          const sha = entry.source.sha;
          if (!repo || !SHA_RE.test(sha || '')) fail(`${plugin.id}: source is not a GitHub repository pinned to a commit`);
          const path = (entry.source.path || '').replace(/^\.\//, '').replace(/\/$/, '');
          if (path.split('/').includes('..')) fail(`${plugin.id}: source path leaves the repository`);
          source = { repo, path, sha };
          facts = describe(join(await tree(repo, sha), path));
        }
        if (!facts) fail(`${plugin.id}: nothing at ${source.repo}/${source.path}`);
        out.plugins[plugin.id] = {
          source,
          author: entry.author && entry.author.name ? entry.author.name : '',
          ...facts,
        };
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return out;
}

const check = process.argv.includes('--check');
const fresh = await snapshot();
if (check) {
  const old = existsSync(OUT) ? read(OUT) : { marketplaces: {}, plugins: {} };
  const changes = [];
  for (const id of Object.keys(fresh.plugins)) {
    const a = JSON.stringify(old.plugins[id] || null);
    const b = JSON.stringify(fresh.plugins[id]);
    if (a !== b) changes.push(`${id}\n  was: ${a}\n  now: ${b}`);
  }
  if (changes.length > 0) {
    process.stdout.write(`${changes.length} plugin(s) changed upstream:\n\n${changes.join('\n\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('upstream: no change in the plugins of the catalog\n');
} else {
  const fetched = process.env.MRCHEVELI_DATE || new Date().toISOString().slice(0, 10);
  writeFileSync(OUT, JSON.stringify({ fetched, ...fresh }, null, 2) + '\n');
  process.stdout.write(`wrote ${OUT}: ${Object.keys(fresh.plugins).length} plugins\n`);
}
