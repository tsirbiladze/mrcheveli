// The catalog build: the same sources give the same bytes, and a wrong source is refused in one
// line that names the file and the entry.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BuildError, build } from '../catalog/build.mjs';
import { FIXTURE, ROOT, readJson } from './helpers.mjs';

const SOURCES = join(ROOT, 'tests', 'fixtures', 'sources');

function broken(file, change) {
  const dir = mkdtempSync(join(tmpdir(), 'mrcheveli-build-'));
  cpSync(SOURCES, dir, { recursive: true });
  const path = join(dir, file);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  change(data);
  writeFileSync(path, JSON.stringify(data));
  return dir;
}

function refuses(file, change, pattern) {
  assert.throws(
    () => build(broken(file, change), '9.9.9'),
    (error) => error instanceof BuildError && pattern.test(error.message),
    `expected a refusal matching ${pattern}`,
  );
}

const plugin = (data, name) => data.plugins.find((p) => p.name === name);
const service = (data, id) => data.services.find((s) => s.id === id);

test('the fixture catalog is what its sources give', () => {
  assert.deepEqual(build(SOURCES, '9.9.9'), readJson(FIXTURE));
});

test('an unchanged copy of the sources builds', () => {
  assert.equal(build(broken('plugins.json', () => {}), '9.9.9').plugins.length, 22);
});

test('the shipped catalog carries no quote and no upstream description', () => {
  const text = readFileSync(FIXTURE, 'utf8');
  assert.ok(!text.includes('"quote"'));
  assert.ok(!text.includes('Gabon, Gambia'));
  assert.ok(!text.includes('"searched"'));
});

test('a status needs its evidence', () => {
  refuses('services.json', (d) => delete service(d, 'crm-a').georgia.source, /"crm-a" needs an https source/);
  refuses('services.json', (d) => (service(d, 'crm-a').georgia.source = 'http://example.test/x'), /"crm-a" needs an https source/);
  refuses('services.json', (d) => (service(d, 'crm-a').georgia.quote = ''), /"crm-a" needs a quote/);
  refuses('services.json', (d) => (service(d, 'crm-a').georgia.quote = 'x'.repeat(241)), /"crm-a" needs a quote/);
  refuses('services.json', (d) => delete service(d, 'crm-a').georgia.checked, /"crm-a" needs georgia\.checked/);
  refuses('services.json', (d) => delete service(d, 'crm-a').georgia.basis, /"crm-a" needs georgia\.basis/);
  refuses('services.json', (d) => (service(d, 'crm-a').georgia.status = 'probably'), /"crm-a" needs georgia\.status/);
  refuses('services.json', (d) => delete service(d, 'pay-x').georgia.note, /"pay-x" georgia\.note: needs "ka" and "en"/);
  refuses('services.json', (d) => (service(d, 'pay-x').georgia.note.ka = ' '), /"pay-x" georgia\.note: "ka" and "en" must not be empty/);
  refuses('services.json', (d) => (service(d, 'crm-b').georgia.source = 'https://example.test/x'), /"crm-b" is "unknown" and must not carry a source/);
  refuses('services.json', (d) => (service(d, 'mail').evidence = 'nothing'), /"mail" points at unknown evidence/);
});

test('a service is one entry with one owner of each connector key', () => {
  refuses('services.json', (d) => d.services.push({ ...service(d, 'chat') }), /"chat" twice/);
  refuses('services.json', (d) => service(d, 'chat').keys.push('Mail'), /connector key "Mail" already belongs to "mail"/);
  refuses('services.json', (d) => (service(d, 'chat').group = 'toys'), /"chat" has an unknown group/);
  refuses('services.json', (d) => delete service(d, 'chat').money, /"chat" needs money/);
});

test('a plugin must still be upstream, at a pinned commit, from the owner it is said to be from', () => {
  refuses('upstream.json', (d) => delete d.plugins['seller@test-market'], /"seller@test-market" is not in the upstream marketplace any more/);
  refuses('upstream.json', (d) => (d.plugins['seller@test-market'] = { missing: true }), /is not in the upstream marketplace any more/);
  refuses('upstream.json', (d) => (d.plugins['seller@test-market'].source.sha = 'main'), /not pinned to a commit/);
  refuses('upstream.json', (d) => (d.plugins['crm-a-plugin@test-market'].source.repo = 'stranger/crm-a-plugin-repo'), /upstream source is stranger\/crm-a-plugin-repo, expected the owner "crm-a-plugin-org"/);
  refuses('upstream.json', (d) => (d.plugins['seller@test-market'].author = 'Somebody Else'), /tier "anthropic" needs an Anthropic source with no other author/);
  refuses('upstream.json', (d) => (d.plugins['crm-a-plugin@test-market'].author = 'Impostor'), /upstream names the author "Impostor", not "Crm-A-Plugin"/);
  refuses('upstream.json', (d) => (d.plugins['seller@test-market'].bin = true), /has bin\//);
  refuses('upstream.json', (d) => (d.plugins['extra1@test-market'].skills = 0), /upstream holds no skill and no connector/);
  refuses('upstream.json', (d) => d.plugins['seller@test-market'].connectors.push({ key: 'abacus', url: '' }), /no service is known for the connector "abacus"/);
});

test('a plugin entry is complete and names only what exists', () => {
  refuses('plugins.json', (d) => (plugin(d, 'seller').name = 'seller; rm -rf ~'), /unsafe name or marketplace/);
  refuses('plugins.json', (d) => (plugin(d, 'seller').marketplace = 'elsewhere'), /must be name@marketplace/);
  refuses('plugins.json', (d) => plugin(d, 'seller').tasks.push('sales.flying'), /unknown task "sales\.flying"/);
  refuses('plugins.json', (d) => (plugin(d, 'seller').tier = 'gold'), /unknown tier/);
  refuses('plugins.json', (d) => (plugin(d, 'seller').what.ka = ''), /what: "ka" and "en" must not be empty/);
  refuses('plugins.json', (d) => delete plugin(d, 'seller').what.en, /what: needs "ka" and "en"/);
  refuses('plugins.json', (d) => (plugin(d, 'keeper').money = false), /money and access disagree/);
  refuses('plugins.json', (d) => (plugin(d, 'crm-a-plugin').requires = []), /a service plugin requires exactly one service/);
  refuses('plugins.json', (d) => (plugin(d, 'crm-a-plugin').requires = ['abacus']), /requires unknown service "abacus"/);
  refuses('plugins.json', (d) => (plugin(d, 'seller').requires = ['chat']), /only a service plugin has requires/);
  refuses('plugins.json', (d) => plugin(d, 'seller').surfaces.push('chatgpt'), /unknown surface "chatgpt"/);
  refuses('plugins.json', (d) => d.plugins.push({ ...plugin(d, 'seller') }), /"seller@test-market" twice/);
});

test('a plugin belongs to one platform: its marketplace, its surfaces and its tier agree', () => {
  refuses('plugins.json', (d) => plugin(d, 'insight').surfaces.push('claude-app'), /surface "claude-app" is not one of ChatGPT's/);
  refuses('plugins.json', (d) => (plugin(d, 'seller').surfaces = ['chatgpt-app']), /surface "chatgpt-app" is not one of Claude's/);
  refuses('plugins.json', (d) => (plugin(d, 'insight').tier = 'anthropic'), /tier "anthropic" is not ChatGPT's/);
  refuses('plugins.json', (d) => (plugin(d, 'seller').tier = 'openai'), /tier "openai" is not Claude's/);
  refuses('upstream.json', (d) => (d.plugins['insight@chat-market'].author = 'Somebody Else'), /tier "openai" needs an OpenAI source that names OpenAI as its developer/);
  refuses('upstream.json', (d) => (d.plugins['chat-app@chat-market'].author = ''), /upstream names no developer/);
  refuses('upstream.json', (d) => (d.plugins['chat-app@chat-market'].author = 'Impostor'), /upstream names the author "Impostor", not "Chat Co\."/);
  refuses('upstream.json', (d) => (d.plugins['chat-app@chat-market'].title = 'Chat <b>App</b>'), /display name is missing or not a plain name/);
  refuses('upstream.json', (d) => delete d.plugins['chat-app@chat-market'].title, /display name is missing or not a plain name/);
  refuses('marketplaces.json', (d) => (d['chat-market'].platform = 'gemini'), /"chat-market" has an unknown platform/);
  refuses('marketplaces.json', (d) => (d['chat-market'].format = 'zip'), /"chat-market": format is one of claude, codex, directory/);
});

test('a plugin with a connector and no skill is allowed, since OpenAI ships such plugins', () => {
  const built = build(SOURCES, '9.9.9').plugins.find((p) => p.id === 'chat-app@chat-market');
  assert.equal(built.skills, 0);
  assert.equal(built.connectors, 1);
  assert.equal(built.title, 'Chat App');
});

test("a plugin known only from a directory's page is written down with the date it was seen, and no more is claimed", () => {
  const built = build(SOURCES, '9.9.9');
  const closer = built.plugins.find((p) => p.id === 'closer@chat-directory');
  // The page shows no skills, so the catalog holds no count; the services it names stand where connectors do.
  assert.equal(closer.skills, null);
  assert.equal(closer.worksWith, true);
  assert.deepEqual(closer.services, ['mail', 'crm-a', 'crm-b', 'pay-x', 'chat']);
  assert.equal(closer.connectors, 5);
  assert.deepEqual(closer.source, { directory: 'chat-directory', seen: '2026-01-02' });
  assert.deepEqual(built.marketplaces['chat-directory'], { repo: null, commit: null, platform: 'chatgpt', installs: 'chat-directory' });
  for (const plugin of built.plugins) assert.equal(plugin.worksWith, plugin.id === 'closer@chat-directory', plugin.id);

  const entry = (d) => d.plugins['closer@chat-directory'];
  refuses('directory.json', (d) => delete d.plugins['closer@chat-directory'], /"closer@chat-directory" is not in catalog\/directory\.json/);
  refuses('directory.json', (d) => delete entry(d).seen, /"closer@chat-directory" needs seen as a date/);
  refuses('directory.json', (d) => (entry(d).how = ' '), /needs how: where the page was seen/);
  refuses('directory.json', (d) => (entry(d).worksWith = {}), /needs worksWith, the services its page names/);
  refuses('directory.json', (d) => entry(d).worksWith.CRM.push('Abacus'), /no service is known for the connector "Abacus"/);
  refuses('directory.json', (d) => (entry(d).developer = 'Somebody Else'), /tier "openai" needs an OpenAI source that names OpenAI as its developer/);
  refuses('directory.json', (d) => delete entry(d).developer, /tier "openai" needs an OpenAI source/);
  refuses('directory.json', (d) => (entry(d).title = '<b>Closer</b>'), /display name is missing or not a plain name/);
  refuses('directory.json', (d) => (d.plugins['ghost@chat-directory'] = entry(d)), /"ghost@chat-directory" is not in catalog\/plugins\.json/);
  refuses('plugins.json', (d) => Object.assign(plugin(d, 'closer'), { kind: 'service', requires: ['mail'] }), /known only from the directory cannot be a service plugin/);
  refuses('marketplaces.json', (d) => (d['chat-directory'].repo = 'example/chat-directory'), /"chat-directory": a directory has no repo/);
  refuses('marketplaces.json', (d) => delete d['chat-market'].repo, /"chat-market": needs a repo/);
});

test('the id a plugin is installed by is built from checked names: the marketplace the command takes, and the app id where the directory lists one', () => {
  const built = build(SOURCES, '9.9.9');
  const install = (name) => built.plugins.find((p) => p.name === name).install;
  assert.equal(install('seller'), 'seller@test-market');
  assert.equal(install('insight'), 'insight@chat-directory');
  assert.equal(install('crm-a-kit'), 'app-0123456789abcdef0123456789abcdef@chat-directory');
  assert.equal(install('closer'), 'closer@chat-directory');
  refuses('marketplaces.json', (d) => (d['chat-market'].installs = 'chat directory; rm -rf ~'), /"chat-market": installs is not a safe name/);
});

test('a Georgian tool says honestly whether it was reviewed', () => {
  refuses('georgian-tools.json', (d) => delete d.tools[1].reviewed, /"reviewed" needs reviewed\.sha and reviewed\.date/);
  refuses('georgian-tools.json', (d) => (d.tools[0].reviewed = d.tools[1].reviewed), /"listed" must not carry a review/);
  refuses('georgian-tools.json', (d) => (d.tools[0].url = 'https://evil.example/tool'), /needs a GitHub url/);
  refuses('georgian-tools.json', (d) => (d.tools[0].status = 'trusted'), /status is "listed" or "reviewed"/);
  refuses('georgian-tools.json', (d) => (d.tools[0].tasks = []), /needs a task/);
});

test('the marketplace of the catalog must be the one that was snapshotted', () => {
  refuses('marketplaces.json', (d) => (d['test-market'].repo = 'example/other-market'), /no snapshot of the marketplace "test-market"/);
});
