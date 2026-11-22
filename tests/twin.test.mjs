// match.mjs and match.py are twins: for the same input they print the same bytes and leave
// with the same exit code. Checked on the synthetic catalog and on the shipped one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIXTURE, REAL, answersFile, base, node, python, readJson } from './helpers.mjs';

function same(args, label) {
  const a = node(args);
  const b = python(args);
  assert.equal(b.status, a.status, `${label}: exit codes differ (python said: ${b.stderr})`);
  assert.equal(b.stdout, a.stdout, `${label}: output differs`);
  assert.equal(b.stderr, a.stderr, `${label}: messages differ`);
  return a;
}

const fixturePersonas = [
  base({ tasks: ['sales.pipeline', 'sales.meetings'], uses: ['crm-a', 'crm-c', 'chat', 'group:google', 'group:crm'], limits: ['managed'] }),
  base({ tasks: ['sales.research'], uses: ['nowhere'], installed: ['seller'] }),
  base({ role: 'finance', tasks: ['finance.books', 'finance.tax'], uses: ['books', 'pay-y'] }),
  base({ role: 'finance', tasks: ['finance.books', 'finance.tax'], limits: ['no-money', 'known-publishers'] }),
  base({ role: 'marketing', tasks: ['marketing.content'], uses: ['design-a'] }),
  base({ role: 'legal', tasks: ['legal.contracts', 'legal.research', 'general.pdf'] }),
  base({ role: 'people', tasks: ['people.hiring'] }),
  base({ tasks: [], uses: ['crm-b'] }),
];

test('the twins agree on the synthetic catalog', () => {
  let runs = 0;
  for (const persona of fixturePersonas) {
    for (const lang of ['ka', 'en']) {
      for (const surface of ['claude-app', 'claude-code', 'chatgpt-app', 'codex-cli']) {
        const file = answersFile({ ...persona, lang, surface });
        for (const format of ['md', 'json']) {
          const result = same(['--answers', file, '--catalog', FIXTURE, '--format', format], `${lang} ${surface} ${format}`);
          assert.equal(result.status, 0);
          runs += 1;
        }
      }
    }
  }
  assert.equal(runs, fixturePersonas.length * 16);
});

test('the twins agree on the shipped catalog, for every task and every named service', () => {
  const catalog = readJson(REAL);
  const roles = catalog.taxonomy.roles.map((r) => r.id);
  for (const role of roles) {
    const tasks = catalog.taxonomy.tasks.filter((t) => t.role === role || t.role === '*').map((t) => t.id);
    for (const lang of ['ka', 'en']) {
      for (const surface of catalog.taxonomy.surfaces) {
        const answers = { lang, surface, role, tasks, uses: ['group:google', 'group:microsoft', 'group:team', 'group:crm'], limits: [], installed: [] };
        const file = answersFile(answers);
        assert.equal(same(['--answers', file, '--catalog', REAL, '--format', 'json'], `${role} ${lang} ${surface}`).status, 0);
        assert.equal(same(['--answers', file, '--catalog', REAL], `${role} ${lang} ${surface} md`).status, 0);
      }
    }
  }
  const everything = {
    lang: 'ka',
    surface: 'claude-app',
    role: 'owner',
    tasks: catalog.taxonomy.tasks.map((t) => t.id),
    uses: catalog.services.map((s) => s.id),
    limits: [],
    installed: [],
  };
  for (const limits of [[], ['no-money'], ['known-publishers'], ['managed', 'no-money', 'known-publishers']]) {
    for (const surface of ['claude-app', 'chatgpt-app']) {
      const file = answersFile({ ...everything, surface, limits });
      assert.equal(same(['--answers', file, '--catalog', REAL, '--format', 'json'], `everything ${surface} ${limits}`).status, 0);
      assert.equal(same(['--answers', file, '--catalog', REAL], `everything md ${surface} ${limits}`).status, 0);
    }
  }
});

test('the twins print the same questions', () => {
  const catalog = readJson(REAL);
  for (const lang of ['ka', 'en']) {
    for (const surface of catalog.taxonomy.surfaces) {
      const at = ['--questions', '--lang', lang, '--surface', surface];
      assert.equal(same(at, `questions ${lang} ${surface}`).status, 0);
      for (const role of catalog.taxonomy.roles) {
        assert.equal(same([...at, '--role', role.id], `questions ${lang} ${surface} ${role.id}`).status, 0);
      }
    }
  }
});

test('the twins refuse the same way', () => {
  const bad = [
    base({ surface: 'chatgpt' }),
    base({ role: 'pilot' }),
    base({ tasks: ['sales.flying'] }),
    base({ uses: ['abacus'] }),
    base({ limits: ['cheap'] }),
    base({ tasks: [], uses: [] }),
    { ...base(), budget: 5 },
    '[1, 2]',
    'null',
    '{not json',
  ];
  for (const answers of bad) {
    const result = same(['--answers', answersFile(answers), '--catalog', FIXTURE], JSON.stringify(answers));
    assert.equal(result.status, 2);
  }
  assert.equal(same(['--answers', '/nonexistent/answers.json', '--catalog', FIXTURE], 'missing file').status, 2);
  assert.equal(same(['--questions', '--surface', 'claude-app', '--lang', 'fr'], 'bad lang').status, 2);
  assert.equal(same(['--questions', '--surface', 'claude-app', '--role', 'pilot'], 'bad role').status, 2);
  assert.equal(same(['--questions'], 'no surface').status, 2);
  assert.equal(same(['--questions', '--surface', 'gemini'], 'bad surface').status, 2);
  assert.equal(same(['--format', 'xml', '--answers', 'x'], 'bad format').status, 2);
});
