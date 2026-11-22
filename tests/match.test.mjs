// What the choice must do, on a small synthetic catalog (tests/fixtures/sources).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIXTURE, base, markdown, match, names, node, refusal } from './helpers.mjs';

test('a task brings the role plugin that covers it', () => {
  const result = match(base({ tasks: ['sales.pipeline'] }));
  assert.deepEqual(names(result), ['seller']);
  assert.match(result.recommend[0].why[0], /Keeping the CRM tidy/);
});

test('a service plugin is recommended only when its service is named', () => {
  const unnamed = match(base({ tasks: ['sales.pipeline'], uses: ['group:crm'] }));
  assert.deepEqual(names(unnamed), ['seller']);
  assert.deepEqual(
    unnamed.hints.map((h) => h.plugin),
    ['crm-a-plugin', 'crm-b-plugin', 'crm-c-plugin'],
  );

  const named = match(base({ tasks: ['sales.pipeline'], uses: ['crm-a'] }));
  assert.deepEqual(names(named), ['seller', 'crm-a-plugin']);
  assert.ok(!named.hints.some((h) => h.plugin === 'crm-a-plugin'));
});

test('a named service alone is enough', () => {
  const result = match(base({ tasks: [], uses: ['chat'] }));
  assert.deepEqual(names(result), ['chat-plugin']);
});

test('a service that does not work in Georgia is never suggested to someone who does not use it', () => {
  const result = match(base({ tasks: ['sales.research'] }));
  assert.ok(!names(result).includes('nowhere-plugin'));
  assert.ok(!result.hints.some((h) => h.plugin === 'nowhere-plugin'));
});

test('a person who says they use such a service is believed, and told what the catalog holds', () => {
  const result = match(base({ tasks: ['sales.research'], uses: ['nowhere', 'pay-x'] }));
  const own = result.recommend.find((item) => item.name === 'nowhere-plugin');
  assert.match(own.warnings[0], /by the catalog, Nowhere does not work in Georgia: It works in one country only\./);
  assert.match(own.warnings[0], /https:\/\/example\.test\/countries/);
  const seller = result.recommend.find((item) => item.name === 'seller');
  assert.deepEqual(seller.connect.map((s) => s.text), ['Pay X (by the catalog it does not work in Georgia, but you use it)']);
  assert.deepEqual(seller.notInGeorgia, []);
});

test('inside a plugin, connectors are sorted into connect, choose, not in Georgia and the rest', () => {
  const result = match(base({ tasks: ['sales.pipeline'], uses: ['chat', 'group:crm'] }));
  const seller = result.recommend.find((item) => item.name === 'seller');
  assert.deepEqual(seller.connect.map((s) => s.id), ['chat']);
  assert.deepEqual(seller.choose.map((c) => c.group), ['crm']);
  assert.deepEqual(seller.choose[0].services.map((s) => s.id), ['crm-a', 'crm-b', 'crm-c']);
  assert.deepEqual(seller.notInGeorgia.map((s) => s.id), ['pay-x']);
  assert.equal(seller.rest, 3);
  assert.equal(seller.connect.length + seller.choose[0].services.length + seller.notInGeorgia.length + seller.rest, 8);
  assert.equal(seller.connectors, 8);
  assert.equal(seller.skills, 36);
});

test('an unknown and a partial status are said, never hidden', () => {
  const result = match(base({ tasks: ['sales.pipeline'], uses: ['group:crm'] }));
  const texts = result.recommend[0].choose[0].services.map((s) => s.text);
  assert.deepEqual(texts, ['CRM A', 'CRM B (not checked)', 'CRM C (partly: card payments only)']);
  assert.equal(result.unknownShown, true);
  assert.deepEqual(result.hints.map((h) => h.text), [
    '- CRM A: plugin `crm-a-plugin`',
    '- CRM B (not checked): plugin `crm-b-plugin`',
    '- CRM C (partly: card payments only): plugin `crm-c-plugin`',
  ]);
  assert.match(markdown(base({ tasks: ['sales.pipeline'], uses: ['group:crm'] })), /"Not checked" means: the catalog holds no official source/);
});

test('a service the person already uses carries no "not checked" mark', () => {
  const result = match(base({ tasks: [], uses: ['crm-b', 'crm-c'] }));
  const b = result.recommend.find((i) => i.name === 'crm-b-plugin');
  assert.deepEqual(b.connect.map((s) => s.text), ['CRM B']);
  assert.deepEqual(b.warnings, []);
  assert.match(result.recommend.find((i) => i.name === 'crm-c-plugin').warnings[0], /CRM C works only partly in Georgia: card payments only/);
  assert.equal(result.unknownShown, false);
  assert.ok(!markdown(base({ tasks: [], uses: ['crm-b', 'crm-c'] })).includes('"Not checked" means'));
});

test('the limit "known-publishers" keeps third-party plugins out', () => {
  const open = match(base({ role: 'marketing', tasks: ['marketing.content'] }));
  assert.deepEqual(names(open), ['outsider']);
  const limited = match(base({ role: 'marketing', tasks: ['marketing.content'], limits: ['known-publishers'] }));
  assert.deepEqual(names(limited), []);
  assert.equal(limited.excluded[0].reason, 'known-publishers');
});

test('the limit "no-money" keeps money plugins, money connectors and money tools out', () => {
  const open = match(base({ role: 'finance', tasks: ['finance.books', 'finance.tax'] }));
  assert.deepEqual(names(open), ['keeper']);
  assert.deepEqual(open.georgianTools.map((t) => t.id), ['tool-listed']);

  const limited = match(base({ role: 'finance', tasks: ['finance.books', 'finance.tax'], limits: ['no-money'] }));
  assert.deepEqual(names(limited), []);
  assert.equal(limited.excluded[0].reason, 'no-money');
  assert.deepEqual(limited.georgianTools, []);

  const seller = match(base({ tasks: ['sales.pipeline'], limits: ['no-money'] })).recommend[0];
  assert.deepEqual(seller.moneySkipped.map((s) => s.id), ['pay-y']);
  assert.deepEqual(seller.notInGeorgia.map((s) => s.id), ['pay-x']);
});

test('the limit "managed" only adds a note', () => {
  const plain = match(base());
  const managed = match(base({ limits: ['managed'] }));
  assert.deepEqual(names(managed), names(plain));
  assert.equal(plain.notes.length, 0);
  assert.match(managed.notes[0], /administrator/);
});

test('what is installed is not recommended again, under any marketplace name', () => {
  const result = match(base({ tasks: ['sales.pipeline'], uses: ['crm-a'], installed: ['seller@another-market', 'crm-a-plugin'] }));
  assert.deepEqual(names(result), []);
  assert.deepEqual(result.excluded.map((e) => e.reason), ['installed', 'installed']);
});

test('never more than five, and the rest are named', () => {
  const result = match(base({ role: 'legal', tasks: ['legal.contracts'] }));
  assert.equal(result.recommend.length, 5);
  assert.deepEqual(names(result), ['extra1', 'extra2', 'extra3', 'extra4', 'extra5']);
  assert.deepEqual(result.overflow, ['extra6', 'extra7']);
});

test('a plugin made for Claude Code only is not offered in the apps', () => {
  const app = match(base({ role: 'marketing', tasks: ['marketing.content'] }));
  assert.ok(!names(app).includes('code-only'));
  const code = match(base({ role: 'marketing', tasks: ['marketing.content'], surface: 'claude-code' }));
  assert.deepEqual(names(code), ['code-only', 'outsider']);
});

test('role plugins first, then by score, publisher and name; the order never changes between runs', () => {
  const answers = base({ tasks: ['sales.pipeline', 'sales.meetings'], uses: ['crm-a', 'crm-c', 'chat'] });
  const first = match(answers);
  assert.deepEqual(names(first), ['seller', 'crm-a-plugin', 'crm-c-plugin', 'chat-plugin']);
  for (let i = 0; i < 3; i += 1) assert.deepEqual(match(answers), first);
});

test('in the apps the steps lead to a button and no command is given', () => {
  const item = match(base()).recommend[0];
  assert.deepEqual(item.install.commands, []);
  assert.equal(item.install.steps.length, 4);
  assert.match(item.install.steps[1], /`seller`.*`example\/test-market`/);
});

test('in Claude Code exactly two commands are given, built from the catalog names', () => {
  const item = match(base({ surface: 'claude-code' })).recommend[0];
  assert.deepEqual(item.install.commands, [
    'claude plugin marketplace add example/test-market',
    'claude plugin install seller@test-market',
  ]);
});

test('a plugin with no connector of its own sends the person to the connectors page', () => {
  const item = match(base({ tasks: [], uses: ['crm-b'] })).recommend[0];
  assert.equal(item.name, 'crm-b-plugin');
  assert.equal(item.connectors, 0);
  assert.match(item.install.steps[3], /Customize > Connectors.*CRM B/);
});

test('a plugin that runs a program or agents on the computer says so', () => {
  const viewer = match(base({ tasks: ['general.pdf'] })).recommend[0];
  assert.match(viewer.access.join(' '), /runs a program on your computer/);
  const outsider = match(base({ role: 'marketing', tasks: ['marketing.content'] })).recommend[0];
  assert.match(outsider.access.join(' '), /agents that run commands/);
});

test('Georgian tools are a separate list and say whether anyone reviewed them', () => {
  const result = match(base({ role: 'legal', tasks: ['legal.research', 'finance.tax'] }));
  assert.deepEqual(names(result), []);
  assert.deepEqual(result.georgianTools.map((t) => [t.id, t.status]), [
    ['tool-listed', 'listed'],
    ['tool-reviewed', 'reviewed'],
  ]);
  assert.match(result.georgianTools[0].text, /found, not reviewed/);
  assert.match(result.georgianTools[1].text, /code read on 2026-01-01, commit cccccccccc\)/);
});

test('nothing fits: it says so and recommends nothing', () => {
  const text = markdown(base({ role: 'people', tasks: ['people.hiring'] }));
  assert.match(text, /no plugin in the catalog fits/);
  assert.ok(!text.includes('## 1.'));
});

test('the Markdown names every part of an item', () => {
  const text = markdown(base({ tasks: ['sales.pipeline'], uses: ['chat', 'group:crm'], limits: ['managed'] }));
  for (const part of ['# Your kit', '## 1. seller', '**What it is:**', '**Why you:**', '**Who publishes it:**', '**What it contains:** 36 skills, 8 connectors', '**Connect:** Chat', '**Pick the ones you use:**', '  - CRM: CRM A, CRM B (not checked), CRM C (partly: card payments only)', '**Does not work in Georgia, do not connect:**', '  - Pay X: A business registered in Georgia cannot open an account. [source](https://example.test/countries)', '**Access:**', '**How to install:**', 'Catalog date: 2026-01-03']) {
    assert.ok(text.includes(part), `missing: ${part}`);
  }
});

test('Georgian is the default language', () => {
  const answers = base();
  delete answers.lang;
  assert.match(markdown(answers), /^# შენი ნაკრები\n/);
});

test('a wrong answers file is refused in one line that names the field', () => {
  const cases = [
    [base({ surface: 'chatgpt' }), /^mrcheveli: answers\.surface: must be one of claude-app, claude-code, chatgpt-app, codex-cli\n$/],
    [base({ role: 'pilot' }), /^mrcheveli: answers\.role: must be one of /],
    [base({ tasks: ['sales.flying'] }), /^mrcheveli: answers\.tasks: unknown task "sales\.flying"\n$/],
    [base({ uses: ['abacus'] }), /^mrcheveli: answers\.uses: unknown service "abacus"/],
    [base({ uses: ['group:abacus'] }), /^mrcheveli: answers\.uses: unknown group "group:abacus"\n$/],
    [base({ limits: ['cheap'] }), /^mrcheveli: answers\.limits: unknown limit "cheap"/],
    [base({ lang: 'fr' }), /^mrcheveli: answers\.lang: must be "ka" or "en"\n$/],
    [base({ tasks: 'sales.pipeline' }), /^mrcheveli: answers\.tasks: must be a list of strings\n$/],
    [base({ tasks: [], uses: ['group:crm'] }), /^mrcheveli: answers\.tasks: give at least one task/],
    [{ ...base(), budget: 5 }, /^mrcheveli: answers\.budget: unknown field/],
    ['[1, 2]', /^mrcheveli: answers: must be a JSON object\n$/],
    ['{not json', /^mrcheveli: answers: .* is not valid JSON\n$/],
  ];
  for (const [answers, pattern] of cases) {
    const result = refusal(answers);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, pattern);
  }
});

test('"none" is the answer for no limits, and stands alone', () => {
  assert.deepEqual(match(base({ limits: ['none'] })), match(base({ limits: [] })));
  const result = refusal(base({ limits: ['none', 'managed'] }));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^mrcheveli: answers\.limits: "none" cannot stand beside another limit\n$/);
});

test('a hint is given only for a kind of tool the person said they use', () => {
  assert.deepEqual(match(base({ tasks: ['sales.pipeline'] })).hints, []);
  assert.equal(match(base({ tasks: ['sales.pipeline'], uses: ['group:crm'] })).hints.length, 3);
});

test('a plugin for one service, beside a role plugin with the same connector, says what it adds', () => {
  const result = match(base({ tasks: ['sales.pipeline'], uses: ['crm-a'] }));
  const own = result.recommend.find((item) => item.name === 'crm-a-plugin');
  assert.equal(own.overlap, '- **Keep in mind:** the `seller` plugin holds a CRM A connector too. This plugin adds 3 skills made for that service alone.');
  assert.equal(result.recommend.find((item) => item.name === 'seller').overlap, '');
  assert.equal(match(base({ tasks: [], uses: ['crm-a'] })).recommend[0].overlap, '');
});

test('Georgian tools are not shown to someone who wants known publishers only', () => {
  const answers = { role: 'legal', tasks: ['legal.research'] };
  assert.equal(match(base(answers)).georgianTools.length, 1);
  assert.deepEqual(match(base({ ...answers, limits: ['known-publishers'] })).georgianTools, []);
});

test('in Claude Code each plugin carries its own command for removing it', () => {
  const item = match(base({ surface: 'claude-code' })).recommend[0];
  assert.match(item.install.steps[1], /To remove: `claude plugin uninstall seller@test-market`\./);
  assert.ok(!markdown(base({ surface: 'claude-code' })).includes('<'));
});

test('the answer explains its two words once, and only when it recommends something', () => {
  assert.match(markdown(base()), /A skill is a set of instructions/);
  assert.ok(!markdown(base({ role: 'people', tasks: ['people.hiring'] })).includes('A skill is a set of instructions'));
});

test('a task nothing was chosen for is said, not dropped', () => {
  const result = match(base({ role: 'finance', tasks: ['finance.books', 'finance.tax'] }));
  assert.deepEqual(names(result), ['keeper']);
  assert.deepEqual(result.uncovered, ['Tax returns and rs.ge']);
  assert.match(markdown(base({ role: 'finance', tasks: ['finance.books', 'finance.tax'] })), /^I chose nothing for these tasks: Tax returns and rs\.ge\.$/m);
  assert.deepEqual(match(base({ tasks: ['sales.pipeline'] })).uncovered, []);
});

test('a task covered only by a plugin left out for its reason is not called uncovered', () => {
  const result = match(base({ role: 'marketing', tasks: ['marketing.content'], limits: ['known-publishers'] }));
  assert.deepEqual(names(result), []);
  assert.deepEqual(result.uncovered, []);
  assert.equal(result.excluded.length, 1);
});

test('a task with no plugin of any kind brings no hint', () => {
  const lonely = match(base({ role: 'people', tasks: ['people.hiring', 'general.pdf'] }));
  assert.deepEqual(names(lonely), ['viewer']);
  assert.deepEqual(lonely.uncovered, ['Hiring and people matters']);
  assert.deepEqual(lonely.hints, []);
});

test('a named service that no chosen plugin connects to is said', () => {
  const result = match(base({ tasks: ['sales.pipeline'], uses: ['chat', 'design-a'], installed: ['chat-plugin'] }));
  assert.deepEqual(names(result), ['seller']);
  assert.deepEqual(result.unconnected, ['Design A']);
  assert.match(markdown(base({ tasks: ['sales.pipeline'], uses: ['chat', 'design-a'], installed: ['chat-plugin'] })), /^None of the chosen plugins holds a connector for: Design A\.$/m);
});

test('a service is offered for matching under its other names too', () => {
  const out = JSON.parse(node(['--questions', '--lang', 'en', '--surface', 'claude-app', '--role', 'sales', '--catalog', FIXTURE]).stdout);
  const choices = out.questions[1].otherChoices;
  assert.deepEqual(choices.find((c) => c.id === 'mail'), { id: 'mail', label: 'Mail (Letters, Post)' });
  assert.deepEqual(choices.find((c) => c.id === 'chat'), { id: 'chat', label: 'Chat' });
});

test('the note for a company account fits the surface', () => {
  assert.match(match(base({ limits: ['managed'] })).notes[0], /says \*\*Request\*\*/);
  assert.match(match(base({ limits: ['managed'], surface: 'claude-code' })).notes[0], /If a command refuses/);
});

test('the reasons are one sentence for the tasks and one for the services', () => {
  const item = match(base({ tasks: ['sales.pipeline', 'sales.meetings'], uses: ['chat'] })).recommend[0];
  assert.deepEqual(item.why, ['you often do: Keeping the CRM tidy and forecasting; Preparing for calls and following up', 'you use: Chat']);
  assert.match(markdown(base({ tasks: ['sales.pipeline', 'sales.meetings'], uses: ['chat'] })), /forecasting; Preparing for calls and following up\. you use: Chat$/m);
});

// ---- two platforms: Claude and ChatGPT --------------------------------------

const chat = (over = {}) => base({ surface: 'chatgpt-app', ...over });

test('a surface gets only the plugins of its own platform', () => {
  assert.deepEqual(names(match(chat())), ['insight']);
  assert.deepEqual(names(match(chat({ surface: 'codex-cli' }))), ['insight']);
  for (const surface of ['claude-app', 'claude-code']) {
    const claude = names(match(base({ surface })));
    assert.ok(claude.includes('seller'));
    assert.ok(!claude.includes('insight'));
  }
});

test('in the ChatGPT app the skill gives steps to the Plugins tab and never a command', () => {
  const item = match(chat({ uses: ['chat'] })).recommend[0];
  assert.equal(item.name, 'insight');
  assert.deepEqual(item.install.commands, []);
  assert.equal(item.install.steps.length, 5);
  assert.match(item.install.steps[0], /open the \*\*Plugins\*\* tab/);
  assert.ok(item.install.steps[1].includes('"Insight Desk"'), 'the person searches by the name the directory shows');
  assert.match(item.install.steps[3], /connect only what is listed above/);
  assert.match(item.install.steps[4], /Start a new chat/);
  const text = markdown(chat({ uses: ['chat'] }));
  assert.ok(!text.includes('```'), 'no command block');
  assert.ok(!/claude plugin|codex plugin/.test(text));
  assert.match(text, /choose \*\*Uninstall plugin\*\*/);
  assert.match(match(chat({ tasks: ['general.day'], uses: ['mail'] })).recommend[0].install.steps[3], /sign in with your own account/);
});

test('in Codex the skill prints one command for each plugin, how to remove it, and the way by hand', () => {
  const cli = (over = {}) => chat({ surface: 'codex-cli', ...over });
  const item = match(cli({ uses: ['chat'] })).recommend[0];
  assert.equal(item.name, 'insight');
  // The id is the one the directory lists the plugin under, not the public repository's.
  assert.deepEqual(item.install.commands, ['codex plugin add insight@chat-directory']);
  assert.equal(item.install.steps.length, 3);
  assert.match(item.install.steps[0], /only this one command/);
  assert.match(item.install.steps[1], /start a new session.*When Codex asks you to connect a service.*To remove: `codex plugin remove insight@chat-directory`\./);
  assert.match(item.install.steps[2], /If the command refuses.*`\/plugins`, search for "Insight Desk"/);
  const text = markdown(cli({ uses: ['chat'] }));
  assert.match(text, /```bash\ncodex plugin add insight@chat-directory\n```\n\nThen start a new session/);
  assert.ok(!text.includes('claude plugin'));
  assert.ok(!text.includes('Uninstall plugin'), 'the way to remove is said under each plugin');
  // A plugin the directory lists under its app's id is installed by that id.
  const kit = match(cli({ uses: ['crm-a'] })).recommend.find((i) => i.name === 'crm-a-kit');
  assert.deepEqual(kit.install.commands, ['codex plugin add app-0123456789abcdef0123456789abcdef@chat-directory']);
  // Nothing to sign in to: the sentence about connecting is left out.
  const closer = match(cli({ tasks: ['sales.meetings'] })).recommend[0];
  assert.ok(!/asks you to connect/.test(closer.install.steps[1]));
  assert.match(match(cli({ limits: ['managed'] })).notes[0], /If a command refuses/);
});

test('a plugin known from its page alone says so, and speaks of the plugins it works with, not of connectors', () => {
  const answers = chat({ tasks: ['sales.meetings'], uses: ['crm-a', 'group:google'] });
  const result = match(answers);
  assert.deepEqual(names(result), ['closer', 'crm-a-kit']);
  const item = result.recommend[0];
  assert.equal(item.skills, null);
  assert.equal(item.worksWith, true);
  assert.equal(item.seen, '2026-01-02');
  assert.deepEqual(item.connect.map((s) => s.id), ['crm-a']);
  assert.deepEqual(item.choose.map((c) => c.services.map((s) => s.id)), [['mail']]);
  assert.deepEqual(item.notInGeorgia.map((s) => s.id), ['pay-x']);
  assert.equal(item.rest, 2);
  const text = markdown(answers);
  assert.match(text, /^- \*\*What it contains:\*\* skills; the catalog does not know how many\. In place of connectors it works with the plugins of 5 services, each installed on its own\.$/m);
  assert.match(text, /^- \*\*How I know:\*\* this plugin is not in OpenAI's public list\. It is described from its page in the plugin directory, seen on 2026-01-02\. You see the same page when you open the plugin in the directory\. The list of services may be incomplete\.$/m);
  assert.match(text, /^- \*\*Of your services it works with:\*\* CRM A\. Each needs its own plugin, installed separately\./m);
  assert.match(text, /^- \*\*If you use one of these, you will need its plugin too:\*\*$/m);
  assert.match(text, /^- \*\*Does not work in Georgia, do not install their plugins:\*\*$/m);
  assert.match(text, /^- \*\*Not needed now:\*\* the plugins of the remaining services \(2\)\.$/m);
  assert.match(text, /^- \*\*Access:\*\* This plugin reaches services through their own plugins:/m);
  assert.ok(!/null|undefined/.test(text));
  // The service's own plugin beside it is what does the connecting, and says so.
  assert.equal(result.recommend[1].overlap, '- **Keep in mind:** `Closer` works with CRM A through this plugin.');
  // A plugin pinned to a commit says none of this.
  const pinned = markdown(chat({ uses: ['crm-a'] }));
  assert.ok(!pinned.includes('How I know') && !pinned.includes('works with the plugins of'));
});

test('beside a plugin that works with other plugins, a connector-only plugin is recommended, not left out', () => {
  const result = match(chat({ tasks: ['sales.meetings'], uses: ['chat'] }));
  assert.deepEqual(names(result), ['closer', 'chat-app']);
  assert.deepEqual(result.excluded, []);
  assert.match(result.recommend[1].overlap, /`Closer` works with Chat through this plugin/);
  // A named service is not called unconnected: the answer says it needs its own plugin.
  assert.deepEqual(match(chat({ tasks: ['sales.meetings'], uses: ['crm-b'] })).unconnected, []);
  // Beside a bundle that holds the connector itself, the old rule still holds.
  const both = match(chat({ tasks: ['sales.meetings', 'sales.pipeline'], uses: ['chat'] }));
  assert.deepEqual(names(both), ['closer', 'insight']);
  assert.deepEqual(both.excluded.map((e) => [e.name, e.reason]), [['chat-app', 'in-bundle']]);
});

test('the wording names the platform the person is on, and no blank is left unfilled', () => {
  for (const lang of ['ka', 'en']) {
    const onChat = markdown(chat({ lang, uses: ['chat'], limits: ['managed'] }));
    assert.ok(onChat.includes('ChatGPT'));
    assert.ok(!markdown(chat({ lang, surface: 'codex-cli', uses: ['chat'], limits: ['managed'] })).includes('Claude'));
    assert.ok(!onChat.includes('Claude'), 'a ChatGPT answer speaks of Claude');
    assert.ok(!/\{[a-zA-Z]+\}/.test(onChat), 'a blank was left unfilled');
    const onClaude = markdown(base({ lang, uses: ['chat'], limits: ['managed'] }));
    assert.ok(onClaude.includes('Claude'));
    assert.ok(!/ChatGPT|OpenAI|Codex/.test(onClaude), 'a Claude answer speaks of ChatGPT');
    assert.ok(!/\{[a-zA-Z]+\}/.test(onClaude), 'a blank was left unfilled');
  }
  assert.match(match(chat({ limits: ['managed'] })).notes[0], /may manage plugins/);
});

test("a publisher's label names the catalog of the platform", () => {
  const onChat = match(chat({ uses: ['crm-a'] })).recommend;
  assert.equal(onChat[0].tierLabel, 'Published by OpenAI');
  assert.equal(onChat[1].name, 'crm-a-kit');
  assert.equal(onChat[1].tierLabel, "Published by the service itself, in OpenAI's catalog");
  const onClaude = match(base({ uses: ['chat'] })).recommend.find((item) => item.name === 'chat-plugin');
  assert.equal(onClaude.tierLabel, "Published by the service itself, in Anthropic's catalog");
});

test("the platform's own plugins get the same one point on both platforms", () => {
  assert.equal(match(chat()).recommend[0].score, 4);
  assert.equal(match(base()).recommend.find((item) => item.name === 'seller').score, 4);
});

test('a plugin that is a connector alone is left out beside a bundle that holds the same connector', () => {
  const result = match(chat({ uses: ['chat'] }));
  assert.deepEqual(names(result), ['insight']);
  assert.deepEqual(result.excluded.map((e) => [e.name, e.reason]), [['chat-app', 'in-bundle']]);
  assert.equal(result.excluded[0].text, '- `Chat App`: the `Insight Desk` plugin already holds the Chat connector, and this plugin adds no skill to it.');
  assert.deepEqual(result.recommend[0].connect.map((s) => s.id), ['chat']);
  assert.deepEqual(result.unconnected, []);
  // With no bundle on the list it is recommended, and says that it holds no skill.
  const alone = match(chat({ tasks: ['general.day'], uses: ['chat', 'mail'] }));
  assert.deepEqual(names(alone), ['mail-app', 'chat-app']);
  assert.match(markdown(chat({ tasks: ['general.day'], uses: ['chat', 'mail'] })), /\*\*What it contains:\*\* 1 connectors, no skills/);
  // A plugin that brings skills of its own stays beside the bundle, and says what it adds.
  const kit = match(chat({ uses: ['crm-a'] })).recommend.find((i) => i.name === 'crm-a-kit');
  assert.match(kit.overlap, /the `Insight Desk` plugin holds a CRM A connector too\. This plugin adds 4 skills made for that service alone\./);
});

test('in ChatGPT a plugin is called by the name the directory shows, in the heading and in every line about it', () => {
  const text = markdown(chat({ uses: ['crm-a'] }));
  assert.match(text, /^## 1\. Insight Desk$/m);
  assert.match(text, /^## 2\. CRM-A Kit$/m);
  assert.ok(!/^## \d\. (insight|crm-a-kit)$/m.test(text));
  assert.match(markdown(chat({ installed: ['insight'] })), /^- `Insight Desk`: you already have it installed\.$/m);
  assert.match(markdown(chat({ uses: ['group:crm'] })), /plugin `CRM-A Kit`$/m);
  // In Claude the name and the id are the same word, so nothing changes there.
  assert.match(markdown(base()), /^## 1\. seller$/m);
});

test('the questions are worded for the platform they are asked on', () => {
  const ask = (surface) => JSON.parse(node(['--questions', '--lang', 'en', '--surface', surface, '--catalog', FIXTURE]).stdout);
  const label = (surface) => ask(surface).questions[1].options[0].label;
  assert.equal(label('claude-app'), 'Only plugins published by Anthropic or by the service itself');
  assert.equal(label('claude-code'), 'Only plugins published by Anthropic or by the service itself');
  assert.equal(label('chatgpt-app'), 'Only plugins published by OpenAI or by the service itself');
  assert.equal(label('codex-cli'), 'Only plugins published by OpenAI or by the service itself');
  const refused = node(['--questions', '--lang', 'en', '--catalog', FIXTURE]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /^mrcheveli: --surface: must be one of claude-app, claude-code, chatgpt-app, codex-cli\n$/);
  for (const phrase of ['noted', 'missing', 'askApp', 'handover']) assert.ok(ask('chatgpt-app').phrases[phrase], phrase);
});

test('in Codex the assistant is called Codex, and in the ChatGPT app ChatGPT', () => {
  assert.match(markdown(chat({ surface: 'codex-cli' })), /A skill is a set of instructions Codex follows/);
  assert.match(markdown(chat()), /A skill is a set of instructions ChatGPT follows/);
});

test('"does not work in Georgia" is said on ChatGPT too, with its source', () => {
  const item = match(chat()).recommend[0];
  assert.deepEqual(item.notInGeorgia.map((s) => s.id), ['pay-x']);
  assert.match(item.notInGeorgia[0].text, /\[source\]\(https:\/\//);
  assert.match(item.access.join(' '), /the whole plugin works only in an app installed on a computer/);
});

test("a plugin installed from OpenAI's directory is known by its name, whatever the marketplace is called", () => {
  const result = match(chat({ installed: ['insight@openai-curated-remote'] }));
  assert.deepEqual(names(result), []);
  assert.deepEqual(result.excluded.map((e) => [e.name, e.reason]), [['insight', 'installed']]);
});

test('a service plugin is hinted at on ChatGPT when the person named only the kind', () => {
  const result = match(chat({ uses: ['group:crm'] }));
  assert.deepEqual(result.hints.map((h) => h.plugin), ['crm-a-kit']);
});

test('a named service whose own plugin is already installed is not called unconnected', () => {
  const result = match(chat({ tasks: ['general.day'], uses: ['mail', 'chat'], installed: ['chat-app'] }));
  assert.deepEqual(result.excluded.map((e) => e.name), ['chat-app']);
  assert.deepEqual(result.unconnected, []);
  assert.deepEqual(match(chat({ tasks: ['general.day'], uses: ['mail', 'design-a'] })).unconnected, ['Design A']);
});

test("a plugin the directory lists under its app's id is still known as installed", () => {
  const listed = 'app-0123456789abcdef0123456789abcdef@openai-curated-remote';
  const result = match(chat({ uses: ['crm-a'], installed: [listed] }));
  assert.deepEqual(result.excluded.map((e) => [e.name, e.reason]), [['crm-a-kit', 'installed']]);
  assert.ok(!names(result).includes('crm-a-kit'));
  assert.deepEqual(match(chat({ uses: ['group:crm'], installed: [listed] })).hints, []);
});

test('on ChatGPT, "nothing fits" says that the catalog is a part of the directory, not that nothing is needed', () => {
  const none = markdown(chat({ role: 'legal', tasks: ['legal.research'] }));
  assert.match(none, /no plugin in the catalog fits\. The catalog covers only a part of OpenAI's public list: OpenAI's plugin directory holds other plugins/);
  assert.ok(!none.includes('nothing you need to install'));
  const some = markdown(chat({ tasks: ['sales.pipeline', 'legal.research'] }));
  assert.match(some, /I chose nothing from the catalog for these tasks: .*OpenAI's plugin directory may hold a plugin/);
  assert.match(markdown(base({ role: 'legal', tasks: ['legal.research'] })), /nothing you need to install now/);
});

test('on ChatGPT, a named service that no chosen plugin connects is not said to be impossible to connect', () => {
  const text = markdown(chat({ uses: ['design-a'] }));
  assert.match(text, /None of the chosen plugins holds a connector for: Design A\. That does not mean they cannot be connected/);
  assert.match(markdown(base({ uses: ['design-a'] })), /^None of the chosen plugins holds a connector for: Design A\.$/m);
});
