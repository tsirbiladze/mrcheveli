// The documents say only what the catalog and the tests stand behind: every number in the two
// READMEs and the two page texts is read from the catalog here, and the example is a real answer.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REAL, ROOT, markdown, readJson } from './helpers.mjs';

const catalog = readJson(REAL);
const sources = readJson(join(ROOT, 'catalog', 'services.json')).services;
const doc = (name) => readFileSync(join(ROOT, name), 'utf8');
const files = {
  'README.md': 'en',
  'README.ka.md': 'ka',
  'docs/mrcheveli.md': 'en',
  'docs/mrcheveli.ka.md': 'ka',
};

const count = (list, test) => list.filter(test).length;
const status = (s) => count(catalog.services, (x) => x.georgia.status === s);
const on = (platform) => count(catalog.plugins, (p) => catalog.marketplaces[p.marketplace].platform === platform);
const upstream = readJson(join(ROOT, 'catalog', 'upstream.json'));
const facts = [
  catalog.plugins.length,
  on('claude'),
  on('chatgpt'),
  count(catalog.plugins, (p) => p.tier === 'anthropic'),
  count(catalog.plugins, (p) => p.tier === 'openai'),
  count(catalog.plugins, (p) => p.tier === 'partner'),
  count(catalog.plugins, (p) => p.tier === 'third-party'),
  catalog.services.length,
  status('yes'),
  status('partial'),
  status('no'),
  status('unknown'),
  catalog.georgianTools.length,
  count(catalog.georgianTools, (t) => t.status === 'reviewed'),
];
const small = catalog.plugins.find((p) => p.name === 'small-business');
const of = (plugin, wanted) =>
  plugin.services.map((id) => catalog.services.find((s) => s.id === id)).filter((s) => s.georgia.status === wanted);
const smallNo = of(small, 'no').map((s) => s.name).sort();
const smallPartial = of(small, 'partial').map((s) => s.name).sort();

test('the table of facts in every document is the catalog', () => {
  for (const name of Object.keys(files)) {
    const rows = [...doc(name).matchAll(/^\| [^|\n]+ \| (\d+) \|$/gm)].map((m) => Number(m[1]));
    assert.deepEqual(rows, facts, `${name}: the table says ${rows}, the catalog ${facts}`);
  }
});

test('what the documents say about the small-business plugin is what the catalog holds', () => {
  const names = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(smallNo).replace(', and ', ' and ');
  const namesKa = `${smallNo.slice(0, -1).join(', ')} და ${smallNo.at(-1)}`;
  for (const name of ['README.md', 'docs/mrcheveli.md']) {
    const text = doc(name);
    assert.ok(text.includes(`holds ${small.skills} skills and connectors to ${small.connectors} services`), name);
    assert.ok(text.includes(`${smallNo.length} of the ${small.connectors} it cannot: ${names}.`), `${name}: expected "${names}"`);
  }
  for (const name of ['README.ka.md', 'docs/mrcheveli.ka.md']) {
    const text = doc(name);
    assert.ok(text.includes(`შეიცავს ${small.skills} სკილს და კონექტორებს ${small.connectors} სერვისთან`), name);
    assert.ok(text.includes(`${small.connectors}-დან ${smallNo.length}-ში არ შეუძლია: ${namesKa}.`), `${name}: expected "${namesKa}"`);
  }
  assert.ok(doc('README.md').includes(`For ${smallPartial.length} more, ${smallPartial.join(' and ')},`));
  assert.ok(doc('README.ka.md').includes(`კიდევ ${smallPartial.length}-ში, ${smallPartial[0]}-სა და ${smallPartial[1]}-ში,`));
  assert.ok(doc('SPEC.md').includes(`holds ${small.skills} skills and connectors to ${small.connectors} services`));
  const sales = catalog.plugins.find((p) => p.name === 'sales');
  assert.ok(doc('SPEC.md').includes(`\`sales\` holds ${sales.skills} skills and ${sales.connectors} connectors`));
});

test('the page texts give the same counts in their sentences', () => {
  const unknown = status('unknown');
  assert.ok(doc('docs/mrcheveli.md').includes(`that is ${unknown} of the ${catalog.services.length} services`));
  assert.ok(doc('docs/mrcheveli.ka.md').includes(`ასეთია ${catalog.services.length} სერვისიდან ${unknown}`));
  assert.ok(doc('docs/mrcheveli.md').includes(`its own catalog of ${catalog.plugins.length} plugins, ${on('claude')} for Claude and ${on('chatgpt')} for ChatGPT`));
  assert.ok(doc('docs/mrcheveli.ka.md').includes(`არსებული ${catalog.plugins.length} პლაგინიდან არჩევს, რომელთაგან ${on('claude')} Claude-ისთვისაა და ${on('chatgpt')} ChatGPT-ისთვის`));
  // How much of OpenAI's public repository the catalog holds.
  const all = upstream.marketplaces['openai-curated'].plugins;
  const fromRepo = count(catalog.plugins, (p) => p.marketplace === 'openai-curated');
  assert.ok(doc('README.md').includes(`${fromRepo} plugins of the ${all} in it`));
  assert.ok(doc('README.ka.md').includes(`${all} პლაგინიდან ${fromRepo}`));
  assert.ok(doc('docs/mrcheveli.md').includes(`${fromRepo} of the ${all} plugins in OpenAI's public repository`));
  assert.ok(doc('docs/mrcheveli.ka.md').includes(`${all} პლაგინიდან ${fromRepo}`));
  // And how many it holds from the directory alone, described from their pages.
  const fromPage = count(catalog.plugins, (p) => catalog.marketplaces[p.marketplace].repo === null);
  assert.equal(fromRepo + fromPage, on('chatgpt'));
  assert.ok(doc('README.md').includes(`and ${fromPage} more that only ChatGPT's directory holds`));
  assert.ok(doc('README.ka.md').includes(`და კიდევ ${fromPage}, რომელიც მხოლოდ ChatGPT-ის დირექტორიაშია`));
  // The Sales plugin: how many services its page names, and that most of their plugins are not in the catalog.
  const sales = catalog.plugins.find((p) => p.id === 'sales@openai-curated-remote');
  const withPlugin = new Set(catalog.plugins.filter((p) => p.kind === 'service' && p.surfaces.includes('chatgpt-app')).flatMap((p) => p.requires));
  assert.ok(sales.services.filter((id) => !withPlugin.has(id)).length > sales.services.length / 2);
  assert.ok(!withPlugin.has('hubspot'));
  assert.ok(doc('README.md').includes(`works with the plugins of ${sales.connectors} services`));
  assert.ok(doc('README.ka.md').includes(`Sales პლაგინი ${sales.connectors} სერვისის პლაგინთან მუშაობს`));
});

test('the example in the READMEs is a real answer, line for line', () => {
  const real = markdown(
    { lang: 'ka', surface: 'claude-app', role: 'owner', tasks: ['owner.money'], uses: ['group:google', 'canva'], limits: [], installed: [] },
    REAL,
  ).split('\n');
  for (const name of ['README.md', 'README.ka.md']) {
    const block = /```markdown\n([\s\S]*?)\n```/.exec(doc(name));
    assert.ok(block, `${name} has no example`);
    for (const line of block[1].split('\n').filter((l) => l.trim() !== '')) {
      assert.ok(real.includes(line), `${name}: this line of the example is not in the real answer:\n${line}`);
    }
  }
});

test('the READMEs count the tests and the checked sources as they are', () => {
  const tests = readdirSync(join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.test.mjs'))
    .reduce((sum, f) => sum + (readFileSync(join(ROOT, 'tests', f), 'utf8').match(/^test\(/gm) || []).length, 0);
  const evidenced = count(sources, (s) => s.georgia && s.georgia.status !== 'unknown');
  assert.ok(doc('README.md').includes(`- ${tests} tests (\`npm test\`)`), `README.md: there are ${tests} tests`);
  assert.ok(doc('README.ka.md').includes(`- ${tests} ტესტი (\`npm test\`)`), `README.ka.md: there are ${tests} tests`);
  assert.ok(doc('README.md').includes(`all ${evidenced} quotes were found`), `README.md: ${evidenced} statuses have evidence`);
  assert.ok(doc('README.ka.md').includes(`${evidenced}-ვე ციტატა მოიძებნა`), `README.ka.md: ${evidenced} statuses have evidence`);
});

test('a document names only what exists in the repository', () => {
  for (const name of ['README.md', 'README.ka.md', 'AGENTS.md', 'SPEC.md']) {
    for (const path of doc(name).matchAll(/`((?:skills|catalog|tests|docs)\/[A-Za-z0-9_./-]+)`/g)) {
      assert.ok(existsSync(join(ROOT, path[1])), `${name} names ${path[1]}, which does not exist`);
    }
  }
});

test('the two languages of a document have the same sections', () => {
  const sections = (name) => (doc(name).match(/^## /gm) || []).length;
  assert.equal(sections('README.ka.md'), sections('README.md'));
  assert.equal(sections('docs/mrcheveli.ka.md'), sections('docs/mrcheveli.md'));
  const steps = (name) => (doc(name).match(/^\d\. \*\*/gm) || []).length;
  assert.equal(steps('README.md'), 5);
  assert.equal(steps('README.ka.md'), 5);
  assert.equal(steps('docs/mrcheveli.md'), 5);
  assert.equal(steps('docs/mrcheveli.ka.md'), 5);
});

test('a page text is what the site expects: frontmatter, no H1, absolute links, no install command', () => {
  for (const name of ['docs/mrcheveli.md', 'docs/mrcheveli.ka.md']) {
    const text = doc(name);
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
    assert.ok(fm, `${name} has no frontmatter`);
    const keys = fm[1].split('\n').map((line) => line.split(':')[0]);
    assert.deepEqual(keys, ['title', 'summary', 'category', 'status', 'source']);
    assert.match(fm[1], /^status: (stable|beta|experimental)$/m);
    assert.match(fm[1], /^source: https:\/\/github\.com\/tsirbiladze\/mrcheveli\/blob\/main\/skills\/mrcheveli\/SKILL\.md$/m);
    const body = text.slice(fm[0].length);
    assert.ok(!/^# /m.test(body), `${name} has an H1`);
    assert.ok(body.trimStart().startsWith('## '), `${name} does not start with a section`);
    assert.ok(!body.includes('npx skills') && !body.includes('/plugin install'), `${name} holds an install command`);
    for (const link of body.matchAll(/\]\(([^)]+)\)/g)) assert.match(link[1], /^https:\/\//, `${name}: ${link[1]}`);
  }
  assert.ok(doc('docs/mrcheveli.md').slice(0, 400).includes('title: The /mrcheveli Skill'));
});
