#!/usr/bin/env node
// Builds skills/mrcheveli/scripts/catalog.json from the files in catalog/.
// No network. The result depends only on those files, so the same sources give the same bytes.
//
//   node catalog/build.mjs            writes the catalog
//   node catalog/build.mjs --check    exits 1 when the written catalog is not what the sources give
//
// What it refuses, each with one line that names the file and the field:
// a plugin the upstream snapshot does not hold, a source that moved to another GitHub owner,
// a connector no service is known for, a "works in Georgia" status without a source and a quote,
// a text missing in one of the two languages.
//
// A plugin comes from one of two kinds of source. One in a public repository is read by
// snapshot.mjs at a pinned commit (upstream.json). One that only a platform's directory shows is
// written down by hand from its page, with the date it was seen (directory.json): the catalog
// then knows what the page says and no more, so not how many skills the plugin holds.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'skills', 'mrcheveli', 'scripts', 'catalog.json');
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const STATUSES = ['yes', 'partial', 'no', 'unknown'];
const BASES = ['country-list', 'restricted-list', 'worldwide-statement', 'georgia-statement'];
const ACCESS = ['reads', 'writes', 'money'];
const KINDS = ['role', 'service', 'utility'];
const FORMATS = ['claude', 'codex', 'directory'];
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const APP_ID_RE = /^app-[0-9a-f]{32}$/;
const INSTALL_RE = /^[a-z0-9][a-z0-9-]{0,63}@[a-z0-9][a-z0-9-]{0,63}$/;
const TITLE_RE = /^[A-Za-z0-9][A-Za-z0-9 .&+-]{0,39}$/;

export class BuildError extends Error {}
const fail = (message) => {
  throw new BuildError(message);
};
const readFrom = (dir) => (name) => {
  // A folder of test sources may leave taxonomy.json out and use the real one.
  const path = existsSync(join(dir, name)) || name !== 'taxonomy.json' ? join(dir, name) : join(HERE, name);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return fail(`catalog/${name}: ${error.message}`);
  }
};

function bothLanguages(value, where) {
  if (!value || typeof value.ka !== 'string' || typeof value.en !== 'string') fail(`${where}: needs "ka" and "en"`);
  if (value.ka.trim() === '' || value.en.trim() === '') fail(`${where}: "ka" and "en" must not be empty`);
  return { ka: value.ka, en: value.en };
}

function connectorKey(key) {
  return key.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

export function build(dir = HERE, givenVersion = null) {
  const read = readFrom(dir);
  const taxonomy = read('taxonomy.json');
  const marketplaces = read('marketplaces.json');
  const upstream = read('upstream.json');
  const curated = read('plugins.json').plugins;
  const serviceFile = read('services.json');
  const tools = read('georgian-tools.json').tools;
  const directory = read('directory.json').plugins;
  const version = givenVersion || JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

  if (!DATE_RE.test(upstream.fetched)) fail('catalog/upstream.json: fetched must be a date');

  // ---- taxonomy
  const ids = (list) => list.map((item) => item.id);
  for (const key of ['roles', 'tasks', 'groups', 'limits', 'tiers']) {
    const seen = new Set();
    for (const item of taxonomy[key]) {
      if (seen.has(item.id)) fail(`catalog/taxonomy.json: ${key} has "${item.id}" twice`);
      seen.add(item.id);
      bothLanguages(item.label, `catalog/taxonomy.json: ${key} "${item.id}" label`);
    }
  }
  const roleIds = ids(taxonomy.roles);
  for (const task of taxonomy.tasks) {
    if (task.role !== '*' && !roleIds.includes(task.role)) fail(`catalog/taxonomy.json: task "${task.id}" has an unknown role`);
  }
  for (const role of taxonomy.roles) {
    const count = taxonomy.tasks.filter((t) => t.role === role.id).length;
    if (count < 2 || count > 4) fail(`catalog/taxonomy.json: role "${role.id}" needs 2 to 4 tasks, has ${count}`);
  }
  if (taxonomy.roles.filter((r) => r.asked).length !== 4) fail('catalog/taxonomy.json: exactly 4 roles are asked');
  if (taxonomy.groups.filter((g) => g.asked).length !== 4) fail('catalog/taxonomy.json: exactly 4 groups are asked');
  if (taxonomy.limits.length !== 3) fail('catalog/taxonomy.json: exactly 3 limits, the fourth answer is "none"');
  const groupIds = ids(taxonomy.groups);
  for (const group of taxonomy.groups) {
    if (group.short !== undefined) bothLanguages(group.short, `catalog/taxonomy.json: group "${group.id}" short`);
    for (const also of group.also || []) {
      if (!groupIds.includes(also)) fail(`catalog/taxonomy.json: group "${group.id}" names an unknown group "${also}"`);
    }
  }
  const taskIds = ids(taxonomy.tasks);
  const tierIds = ids(taxonomy.tiers);
  const platforms = new Map();
  const claimed = new Set();
  for (const platform of taxonomy.platforms || []) {
    const where = `catalog/taxonomy.json: platform "${platform.id}"`;
    if (!NAME_RE.test(platform.id || '') || platforms.has(platform.id)) fail(`${where}: bad or repeated id`);
    for (const key of ['name', 'owner']) {
      if (typeof platform[key] !== 'string' || !TITLE_RE.test(platform[key])) fail(`${where} needs a plain ${key}`);
    }
    if (!tierIds.includes(platform.tier)) fail(`${where} has an unknown tier`);
    for (const surface of platform.surfaces) {
      if (!platform.assistant || typeof platform.assistant[surface] !== 'string' || !TITLE_RE.test(platform.assistant[surface])) {
        fail(`${where} needs the assistant's name on "${surface}"`);
      }
    }
    for (const surface of platform.surfaces) {
      if (!taxonomy.surfaces.includes(surface) || claimed.has(surface)) fail(`${where}: surface "${surface}" is unknown or belongs to another platform`);
      claimed.add(surface);
    }
    platforms.set(platform.id, platform);
  }
  for (const surface of taxonomy.surfaces) {
    if (!claimed.has(surface)) fail(`catalog/taxonomy.json: surface "${surface}" belongs to no platform`);
  }
  for (const [name, market] of Object.entries(marketplaces)) {
    const where = `catalog/marketplaces.json: "${name}"`;
    if (!NAME_RE.test(name)) fail(`${where}: unsafe name`);
    if (!platforms.has(market.platform)) fail(`${where} has an unknown platform`);
    if (!FORMATS.includes(market.format)) fail(`${where}: format is one of ${FORMATS.join(', ')}`);
    // A directory is no repository: nothing in it can be pinned to a commit.
    if (market.format === 'directory' ? market.repo !== undefined : !REPO_RE.test(market.repo || '')) {
      fail(`${where}: ${market.format === 'directory' ? 'a directory has no repo' : 'needs a repo, as owner/name'}`);
    }
    // The marketplace name the platform's install command takes, where it is not this one.
    if (market.installs !== undefined && !NAME_RE.test(market.installs)) fail(`${where}: installs is not a safe name`);
  }
  for (const id of Object.keys(directory)) {
    if (!curated.some((plugin) => plugin.id === id)) fail(`catalog/directory.json: "${id}" is not in catalog/plugins.json`);
  }

  // ---- services
  const rawServices = new Map();
  for (const service of serviceFile.services) {
    if (!NAME_RE.test(service.id || '')) fail(`catalog/services.json: bad id "${service.id}"`);
    if (rawServices.has(service.id)) fail(`catalog/services.json: "${service.id}" twice`);
    rawServices.set(service.id, service);
  }
  const keyToService = new Map();
  const services = [];
  for (const service of serviceFile.services) {
    const where = `catalog/services.json: "${service.id}"`;
    if (typeof service.name !== 'string' || service.name === '') fail(`${where} needs a name`);
    if (!groupIds.includes(service.group)) fail(`${where} has an unknown group "${service.group}"`);
    if (typeof service.money !== 'boolean') fail(`${where} needs money: true or false`);
    let evidence = service;
    if (service.evidence !== undefined) {
      evidence = rawServices.get(service.evidence);
      if (!evidence) fail(`${where} points at unknown evidence "${service.evidence}"`);
      if (evidence.evidence !== undefined) fail(`${where} points at "${service.evidence}", which has no evidence of its own`);
      if (service.georgia !== undefined) fail(`${where} has both georgia and evidence`);
    }
    const g = evidence.georgia;
    if (!g || !STATUSES.includes(g.status)) fail(`${where} needs georgia.status, one of ${STATUSES.join(', ')}`);
    let note = { ka: '', en: '' };
    let source = '';
    let checked = '';
    if (g.status === 'unknown') {
      if (g.source || g.quote) fail(`${where} is "unknown" and must not carry a source or a quote`);
    } else {
      if (!BASES.includes(g.basis)) fail(`${where} needs georgia.basis, one of ${BASES.join(', ')}`);
      if (typeof g.source !== 'string' || !/^https:\/\/[^\s()]+$/.test(g.source)) fail(`${where} needs an https source`);
      if (typeof g.quote !== 'string' || g.quote.trim() === '' || g.quote.length > 240) fail(`${where} needs a quote of 1 to 240 characters`);
      if (!DATE_RE.test(g.checked || '')) fail(`${where} needs georgia.checked as a date`);
      source = g.source;
      checked = g.checked;
    }
    if (g.status === 'partial' || g.status === 'no') note = bothLanguages(g.note, `${where} georgia.note`);
    else if (g.note !== undefined) note = bothLanguages(g.note, `${where} georgia.note`);
    for (const key of service.keys || []) {
      const normal = connectorKey(key);
      if (keyToService.has(normal)) fail(`${where}: connector key "${key}" already belongs to "${keyToService.get(normal)}"`);
      keyToService.set(normal, service.id);
    }
    if (service.abstract === true) continue;
    const aliases = service.aliases || [];
    if (!Array.isArray(aliases) || aliases.some((a) => typeof a !== 'string' || a.trim() === '')) fail(`${where}: aliases must be a list of names`);
    services.push({
      id: service.id,
      name: service.name,
      aliases,
      group: service.group,
      money: service.money,
      georgia: { status: g.status, source, checked, note },
    });
  }
  const serviceIds = new Set(services.map((s) => s.id));

  // ---- plugins
  const plugins = [];
  const seenPlugins = new Set();
  for (const plugin of curated) {
    const where = `catalog/plugins.json: "${plugin.id}"`;
    if (seenPlugins.has(plugin.id)) fail(`${where} twice`);
    seenPlugins.add(plugin.id);
    if (!NAME_RE.test(plugin.name || '') || !NAME_RE.test(plugin.marketplace || '')) fail(`${where} has an unsafe name or marketplace`);
    if (plugin.id !== `${plugin.name}@${plugin.marketplace}`) fail(`${where} must be name@marketplace`);
    if (!marketplaces[plugin.marketplace]) fail(`${where}: marketplace is not in catalog/marketplaces.json`);
    if (!tierIds.includes(plugin.tier)) fail(`${where} has an unknown tier`);
    const market = marketplaces[plugin.marketplace];
    const platform = platforms.get(market.platform);
    if (!KINDS.includes(plugin.kind)) fail(`${where}: kind must be one of ${KINDS.join(', ')}`);
    if (typeof plugin.publisher !== 'string' || plugin.publisher === '') fail(`${where} needs a publisher`);
    if (typeof plugin.money !== 'boolean') fail(`${where} needs money: true or false`);
    for (const task of plugin.tasks) if (!taskIds.includes(task)) fail(`${where}: unknown task "${task}"`);
    for (const surface of plugin.surfaces) {
      if (!taxonomy.surfaces.includes(surface)) fail(`${where}: unknown surface "${surface}"`);
      if (!platform.surfaces.includes(surface)) fail(`${where}: surface "${surface}" is not one of ${platform.name}'s`);
    }
    if (plugin.surfaces.length === 0) fail(`${where} needs a surface`);
    for (const flag of plugin.access) if (!ACCESS.includes(flag)) fail(`${where}: access is one of ${ACCESS.join(', ')}`);
    if (plugin.money !== plugin.access.includes('money')) fail(`${where}: money and access disagree`);
    for (const sid of plugin.requires) if (!serviceIds.has(sid)) fail(`${where}: requires unknown service "${sid}"`);
    if (plugin.kind === 'service' && plugin.requires.length !== 1) fail(`${where}: a service plugin requires exactly one service`);
    if (plugin.kind !== 'service' && plugin.requires.length !== 0) fail(`${where}: only a service plugin has requires`);
    if (plugin.kind !== 'service' && plugin.tasks.length === 0) fail(`${where} needs a task`);
    const what = bothLanguages(plugin.what, `${where} what`);

    const fromDirectory = market.format === 'directory';
    let up = upstream.plugins[plugin.id];
    let owner;
    if (fromDirectory) {
      // Written down from the plugin's page: the names it works with stand where connectors do.
      const page = directory[plugin.id];
      const at = `catalog/directory.json: "${plugin.id}"`;
      if (!page) fail(`${where} is not in catalog/directory.json`);
      if (!DATE_RE.test(page.seen || '')) fail(`${at} needs seen as a date`);
      if (typeof page.how !== 'string' || page.how.trim() === '') fail(`${at} needs how: where the page was seen`);
      if (plugin.kind === 'service') fail(`${where}: a plugin known only from the directory cannot be a service plugin`);
      const names = Object.values(page.worksWith || {}).flat();
      if (names.length === 0 || names.some((name) => typeof name !== 'string' || name.trim() === '')) fail(`${at} needs worksWith, the services its page names`);
      up = {
        source: { directory: plugin.marketplace, seen: page.seen },
        author: page.developer || '',
        title: page.title,
        skills: null,
        connectors: names.map((key) => ({ key, url: '' })),
        localServers: [],
        agents: false,
        hooks: false,
        bin: false,
      };
      owner = plugin.owner;
    } else {
      if (!up || up.missing) fail(`${where} is not in the upstream marketplace any more (catalog/upstream.json)`);
      if (!SHA_RE.test(up.source.sha)) fail(`${where}: upstream source is not pinned to a commit`);
      owner = up.source.repo.split('/')[0];
      if (owner !== plugin.owner) fail(`${where}: upstream source is ${up.source.repo}, expected the owner "${plugin.owner}"`);
    }
    const ownTiers = [...platforms.values()].map((item) => item.tier);
    if (ownTiers.includes(plugin.tier) && plugin.tier !== platform.tier) fail(`${where}: tier "${plugin.tier}" is not ${platform.name}'s`);
    if (plugin.tier === 'anthropic' && (owner !== 'anthropics' || up.author !== '')) fail(`${where}: tier "anthropic" needs an Anthropic source with no other author`);
    if (plugin.tier === 'openai' && (owner !== 'openai' || up.author !== 'OpenAI')) fail(`${where}: tier "openai" needs an OpenAI source that names OpenAI as its developer`);
    if (market.format !== 'claude' && up.author === '') fail(`${where}: upstream names no developer`);
    if (!ownTiers.includes(plugin.tier) && up.author !== '' && up.author !== plugin.publisher) fail(`${where}: upstream names the author "${up.author}", not "${plugin.publisher}"`);
    if (up.bin && plugin.surfaces.includes('claude-app')) fail(`${where}: has bin/, which Claude's apps refuse to install`);
    if (up.skills < 1 && up.connectors.length < 1) fail(`${where}: upstream holds no skill and no connector`);
    // The name a person searches for. Only OpenAI's directory shows one that differs from the id.
    const title = market.format === 'claude' ? plugin.name : up.title;
    if (typeof title !== 'string' || !TITLE_RE.test(title)) fail(`${where}: upstream display name is missing or not a plain name`);

    let pluginServices = plugin.requires.slice();
    if (plugin.kind !== 'service') {
      pluginServices = [];
      for (const connector of up.connectors) {
        const sid = keyToService.get(connectorKey(connector.key));
        if (!sid) fail(`${where}: no service is known for the connector "${connector.key}" (add its key in catalog/services.json)`);
        if (!serviceIds.has(sid)) fail(`${where}: connector "${connector.key}" maps to "${sid}", which is not a service`);
        if (!pluginServices.includes(sid)) pluginServices.push(sid);
      }
    }
    // OpenAI's directory lists some plugins under the id of their app instead of their name.
    // The list of installed plugins then holds that id, so the catalog keeps it beside the name.
    const aka = market.format === 'codex' ? up.connectors.map((c) => c.key).filter((key) => APP_ID_RE.test(key)) : [];
    // What the platform's install command takes: the id the directory lists the plugin under.
    const install = `${aka[0] || plugin.name}@${market.installs || plugin.marketplace}`;
    if (!INSTALL_RE.test(install)) fail(`${where}: "${install}" is not a safe id to install`);
    const access = plugin.access.slice();
    if (up.localServers.length > 0) access.push('local');
    if (up.agents || up.hooks) access.push('agents');

    plugins.push({
      id: plugin.id,
      name: plugin.name,
      aka,
      title,
      install,
      marketplace: plugin.marketplace,
      publisher: plugin.publisher,
      tier: plugin.tier,
      kind: plugin.kind,
      tasks: plugin.tasks,
      requires: plugin.requires,
      services: pluginServices,
      // null where the source does not show it: a directory's page names no skills.
      skills: up.skills,
      // For a bundle: the services it connects to. Upstream may hold several connectors for one
      // service, and the answer sorts services, so they are counted once.
      connectors: plugin.kind === 'service' ? up.connectors.length : pluginServices.length,
      // true where those services are reached through their own plugins, installed separately,
      // and not through connectors inside this one.
      worksWith: fromDirectory,
      access,
      money: plugin.money,
      surfaces: plugin.surfaces,
      what,
      source: up.source,
    });
  }

  // ---- Georgian tools
  const georgianTools = tools.map((tool) => {
    const where = `catalog/georgian-tools.json: "${tool.id}"`;
    if (!NAME_RE.test(tool.id || '')) fail(`${where}: bad id`);
    if (!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(tool.url || '')) fail(`${where} needs a GitHub url`);
    if (tool.status !== 'listed' && tool.status !== 'reviewed') fail(`${where}: status is "listed" or "reviewed"`);
    if (typeof tool.money !== 'boolean') fail(`${where} needs money: true or false`);
    for (const task of tool.tasks) if (!taskIds.includes(task)) fail(`${where}: unknown task "${task}"`);
    if (tool.tasks.length === 0) fail(`${where} needs a task`);
    let reviewed = null;
    if (tool.status === 'reviewed') {
      const r = tool.reviewed || {};
      if (!SHA_RE.test(r.sha || '') || !DATE_RE.test(r.date || '')) fail(`${where}: "reviewed" needs reviewed.sha and reviewed.date`);
      reviewed = { date: r.date, sha: r.sha };
    } else if (tool.reviewed) fail(`${where}: "listed" must not carry a review`);
    return {
      id: tool.id,
      name: tool.name,
      url: tool.url,
      status: tool.status,
      reviewed,
      money: tool.money,
      tasks: tool.tasks,
      what: bothLanguages(tool.what, `${where} what`),
    };
  });

  const builtMarkets = {};
  for (const [name, market] of Object.entries(marketplaces)) {
    const installs = market.installs || name;
    if (market.format === 'directory') {
      builtMarkets[name] = { repo: null, commit: null, platform: market.platform, installs };
      continue;
    }
    const up = upstream.marketplaces[name];
    if (!up || up.repo !== market.repo || !SHA_RE.test(up.commit)) fail(`catalog/upstream.json: no snapshot of the marketplace "${name}"`);
    builtMarkets[name] = { repo: market.repo, commit: up.commit, platform: market.platform, installs };
  }

  return {
    schema: 1,
    version,
    generated: upstream.fetched,
    issues: 'https://github.com/tsirbiladze/mrcheveli/issues',
    marketplaces: builtMarkets,
    taxonomy,
    services,
    plugins,
    georgianTools,
  };
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  try {
    const text = JSON.stringify(build(), null, 2) + '\n';
    if (process.argv.includes('--check')) {
      const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
      if (current !== text) {
        process.stderr.write('build: skills/mrcheveli/scripts/catalog.json is not what catalog/ gives. Run: node catalog/build.mjs\n');
        process.exit(1);
      }
      process.stdout.write('build: the catalog is up to date\n');
    } else {
      writeFileSync(OUT, text);
      const c = JSON.parse(text);
      process.stdout.write(`build: ${c.plugins.length} plugins, ${c.services.length} services, ${c.georgianTools.length} Georgian tools\n`);
    }
  } catch (error) {
    if (!(error instanceof BuildError)) throw error;
    process.stderr.write(`build: ${error.message}\n`);
    process.exit(1);
  }
}
