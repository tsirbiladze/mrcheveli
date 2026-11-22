// The shipped catalog: it is what catalog/ gives, it carries nothing copied from third parties,
// every status has its evidence, and every plugin in it can be reached and safely installed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { build } from '../catalog/build.mjs';
import { REAL, ROOT, SCRIPTS, match, node, readJson } from './helpers.mjs';

const catalog = readJson(REAL);
const sources = readJson(join(ROOT, 'catalog', 'services.json')).services;
const georgian = /[ა-ჿ]/;

const answers = (over) => ({ lang: 'en', surface: 'claude-code', role: 'owner', tasks: [], uses: [], limits: [], installed: [], ...over });

test('the shipped catalog is what catalog/ gives', () => {
  assert.deepEqual(build(), catalog);
  assert.equal(readFileSync(REAL, 'utf8'), JSON.stringify(build(), null, 2) + '\n');
});

test('nothing copied from a third party ships: no quotes, no research notes', () => {
  const text = readFileSync(REAL, 'utf8');
  assert.ok(!text.includes('"quote"'));
  assert.ok(!text.includes('"searched"'));
  for (const service of sources) {
    const quote = service.georgia && service.georgia.quote;
    if (quote && quote.length > 20) assert.ok(!text.includes(quote), `the quote of ${service.id} is in the shipped catalog`);
  }
});

test('every status other than "unknown" has a source, a quote and a date; "no" and "partial" say why in both languages', () => {
  for (const service of sources) {
    if (service.evidence) continue;
    const g = service.georgia;
    if (g.status === 'unknown') {
      assert.equal(g.source, undefined, service.id);
      continue;
    }
    assert.match(g.source, /^https:\/\//, service.id);
    assert.ok(g.quote.length > 0 && g.quote.length <= 240, service.id);
    assert.match(g.checked, /^\d{4}-\d{2}-\d{2}$/, service.id);
  }
  for (const service of catalog.services) {
    if (service.georgia.status === 'no' || service.georgia.status === 'partial') {
      assert.match(service.georgia.note.ka, georgian, service.id);
      assert.ok(service.georgia.note.en.length > 10, service.id);
      assert.match(service.georgia.source, /^https:\/\//, service.id);
    }
  }
});

test('every plugin is pinned to a commit, or dated to the day its page was seen, and described in both languages, in our own words', () => {
  const directory = readJson(join(ROOT, 'catalog', 'directory.json')).plugins;
  for (const plugin of catalog.plugins) {
    if (catalog.marketplaces[plugin.marketplace].repo === null) {
      // Known from its page in a directory alone: a date, the note of where it was seen, and no skill count.
      assert.match(plugin.source.seen, /^\d{4}-\d{2}-\d{2}$/, plugin.id);
      assert.equal(plugin.source.sha, undefined, plugin.id);
      assert.equal(plugin.skills, null, plugin.id);
      assert.equal(plugin.worksWith, true, plugin.id);
      assert.ok(directory[plugin.id].how.length > 40, plugin.id);
    } else {
      assert.match(plugin.source.sha, /^[0-9a-f]{40}$/, plugin.id);
      assert.equal(plugin.worksWith, false, plugin.id);
    }
    assert.match(plugin.what.ka, georgian, plugin.id);
    assert.ok(plugin.what.en.length > 20, plugin.id);
    assert.ok(plugin.skills >= 1 || plugin.connectors >= 1, plugin.id);
  }
  // Nothing of the page's own text ships: not the note, not its headings.
  const text = readFileSync(REAL, 'utf8');
  assert.ok(!text.includes('"how"') && !text.includes('Sales Intelligence'));
  for (const tool of catalog.georgianTools) {
    assert.match(tool.what.ka, georgian, tool.id);
    assert.match(tool.url, /^https:\/\/github\.com\//, tool.id);
  }
});

test('every plugin can be reached by some answer, and its commands are the only three allowed shapes', () => {
  const platformOf = (plugin) => catalog.marketplaces[plugin.marketplace].platform;
  const add = /^claude plugin marketplace add anthropics\/knowledge-work-plugins$/;
  const install = /^claude plugin install [a-z0-9][a-z0-9-]*@knowledge-work-plugins$/;
  const codexAdd = /^codex plugin add [a-z0-9][a-z0-9-]*@openai-curated-remote$/;
  for (const plugin of catalog.plugins) {
    const claude = platformOf(plugin) === 'claude';
    const result = match(
      answers({
        surface: claude ? 'claude-code' : 'codex-cli',
        tasks: plugin.kind === 'service' ? [] : [plugin.tasks[0]],
        uses: plugin.kind === 'service' ? plugin.requires : [],
      }),
      REAL,
    );
    const names = result.recommend.map((item) => item.name).concat(result.overflow);
    assert.ok(names.includes(plugin.name), `${plugin.name} is never recommended`);
    const item = result.recommend.find((i) => i.name === plugin.name);
    if (item && !claude) {
      // In Codex one command, with the way by hand beside it for when the command refuses.
      assert.equal(item.install.commands.length, 1);
      assert.match(item.install.commands[0], codexAdd);
      assert.equal(item.install.steps.length, 3);
      assert.ok(item.install.steps[1].includes(item.install.commands[0].replace(' add ', ' remove ')), plugin.id);
      assert.ok(item.install.steps[2].includes(plugin.title), plugin.id);
      // In the ChatGPT app the skill runs nothing: the person installs from the Plugins tab.
      const inApp = match(
        answers({ surface: 'chatgpt-app', tasks: plugin.kind === 'service' ? [] : [plugin.tasks[0]], uses: plugin.kind === 'service' ? plugin.requires : [] }),
        REAL,
      ).recommend.find((i) => i.name === plugin.name);
      assert.deepEqual(inApp.install.commands, []);
      assert.equal(inApp.install.steps.length, 5);
      assert.ok(inApp.install.steps[1].includes(plugin.title), plugin.id);
    }
    if (item && claude) {
      assert.equal(item.install.commands.length, 2);
      assert.match(item.install.commands[0], add);
      assert.match(item.install.commands[1], install);
    }
  }
});

test('the questions fit a tool that takes four answers and a 12-character header', () => {
  for (const [lang, surface] of [['ka', 'claude-app'], ['en', 'claude-code'], ['ka', 'chatgpt-app'], ['en', 'codex-cli']]) {
    const first = JSON.parse(node(['--questions', '--lang', lang, '--surface', surface]).stdout);
    assert.equal(first.round, 1);
    assert.deepEqual(first.questions.map((q) => q.id), ['role', 'limits']);
    assert.deepEqual(first.questions[0].options, []);
    assert.ok(first.questions[0].otherChoices.some((r) => r.id === 'general'));
    assert.equal(first.questions[1].other, null);
    assert.equal(first.questions[1].options.at(-1).id, 'none');
    const rounds = [first];
    for (const role of catalog.taxonomy.roles) {
      const second = JSON.parse(node(['--questions', '--lang', lang, '--surface', surface, '--role', role.id]).stdout);
      assert.equal(second.round, 2);
      assert.deepEqual(second.questions.map((q) => q.id), ['tasks', 'uses']);
      rounds.push(second);
    }
    for (const round of rounds) {
      for (const question of round.questions) {
        if (question.id !== 'role') assert.ok(question.options.length >= 2 && question.options.length <= 4, question.id);
        assert.ok([...question.header].length <= 12, `${question.header} is longer than 12 characters`);
        assert.ok(question.text.length > 5);
        assert.equal(question.other !== null, question.otherChoices.length > 0);
      }
      assert.ok(Object.keys(round.phrases).length >= 10);
    }
  }
});

test('the messages of the two languages are the same set, with the same blanks, and none is unused', () => {
  const messages = readJson(join(SCRIPTS, 'messages.json'));
  assert.deepEqual(Object.keys(messages.ka), Object.keys(messages.en));
  const blanks = (text) => (text.match(/\{[a-zA-Z]+\}/g) || []).sort();
  const code = readFileSync(join(SCRIPTS, 'match.mjs'), 'utf8');
  const platforms = readJson(join(SCRIPTS, 'catalog.json')).taxonomy.platforms.map((p) => p.id);
  for (const full of Object.keys(messages.ka)) {
    assert.deepEqual(blanks(messages.ka[full]), blanks(messages.en[full]), full);
    // "key@platform" is how one platform says "key": the plain key must exist and be used.
    const [key, platform] = full.split('@');
    if (platform !== undefined) {
      assert.ok(platforms.includes(platform), `${full}: unknown platform`);
      assert.ok(key in messages.ka, `${full}: there is no plain "${key}"`);
    }
    const used =
      code.includes(`'${key}'`) ||
      (key.startsWith('access.') && code.includes('`access.${flag}`')) ||
      (/^(question|header)\.(role|limits|tasks|uses)$/.test(key) && code.includes('`question.${id}`') && code.includes('`header.${id}`')) ||
      (key.startsWith('say.') && code.includes("key.startsWith('say.')"));
    assert.ok(used, `message "${full}" is never used`);
  }
  for (const used of code.matchAll(/m\['([a-zA-Z.-]+)'\]/g)) {
    assert.ok(used[1] in messages.ka, `match.mjs uses a message that does not exist: ${used[1]}`);
  }
  for (const key of Object.keys(messages.ka)) {
    if (!['flag.partial', 'flag.no', 'group.item', 'sub.item', 'tools.item', 'list.and'].includes(key)) {
      assert.match(messages.ka[key], georgian, `"${key}" has no Georgian text`);
    }
  }
});
