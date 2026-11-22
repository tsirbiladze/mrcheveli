// The shipped catalog, for six fictional people in Georgia: who gets what. These are the contract
// of the catalog's content: when a plugin's tasks or a service's status changes, a line here changes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REAL, match, names } from './helpers.mjs';

const person = (over) => match({ lang: 'ka', surface: 'claude-app', limits: [], installed: [], uses: [], ...over }, REAL);
const ids = (list) => list.map((s) => s.id);

test('an unlisted or mixed activity gets matches for its actual tasks', () => {
  const general = (surface, tasks, uses = []) => person({ role: 'general', surface, tasks, uses });
  for (const [surface, analysis] of [['claude-app', 'data'], ['chatgpt-app', 'data-analytics']]) {
    assert.deepEqual(names(general(surface, ['general.slides'], ['canva'])), ['canva']);
    assert.deepEqual(names(general(surface, ['general.analysis', 'general.slides'], ['canva'])), [analysis, 'canva']);
    const unsupported = general(surface, ['general.other']);
    assert.deepEqual(unsupported.recommend, []);
    assert.deepEqual(unsupported.hints, []);
    assert.equal(unsupported.uncovered.length, 1);
    const partial = general(surface, ['general.other', 'general.slides'], ['canva']);
    assert.deepEqual(names(partial), ['canva']);
    assert.deepEqual(partial.uncovered, unsupported.uncovered);
  }
  assert.deepEqual(names(general('claude-code', ['general.review'])), ['engineering']);
  assert.deepEqual(names(general('codex-cli', ['general.web'])), ['build-web-apps']);
});

test('a shop owner who uses Google and Canva', () => {
  const result = person({ role: 'owner', tasks: ['owner.money', 'owner.marketing'], uses: ['group:google', 'canva'] });
  assert.deepEqual(names(result), ['small-business', 'canva']);
  const bundle = result.recommend[0];
  assert.deepEqual(ids(bundle.connect), ['canva']);
  assert.deepEqual(bundle.choose.map((c) => [c.label, ids(c.services)]), [['Google', ['gmail', 'google-calendar', 'google-drive']]]);
  assert.deepEqual(ids(bundle.notInGeorgia), ['airwallex', 'gusto', 'myob', 'ramp', 'ringcentral', 'square', 'stripe', 'tiktok-ads']);
  for (const service of bundle.notInGeorgia) assert.match(service.text, /\[წყარო\]\(https:\/\/[^)]+\)$/);
  assert.equal(bundle.skills, 44);
  assert.equal(bundle.connectors, 35);
  assert.equal(bundle.connect.length + 3 + bundle.notInGeorgia.length + bundle.rest, 35);
  assert.ok(result.georgianTools.some((t) => t.id === 'rsge-mcp'));
});

test('the same owner, who wants nothing that touches money', () => {
  const result = person({ role: 'owner', tasks: ['owner.money', 'owner.marketing'], uses: ['canva'], limits: ['no-money'] });
  assert.deepEqual(names(result), ['canva']);
  assert.deepEqual(result.excluded.map((e) => [e.name, e.reason]), [['small-business', 'no-money']]);
  assert.ok(!result.georgianTools.some((t) => ['rsge-mcp', 'bog-business-mcp'].includes(t.id)));
});

test('an accountant who files with rs.ge', () => {
  const result = person({ role: 'finance', tasks: ['finance.books', 'finance.tax'], uses: ['group:google'] });
  assert.deepEqual(names(result), ['finance']);
  assert.match(result.recommend[0].what, /საქართველოს საგადასახადო წესებს არ იცნობს/);
  assert.deepEqual(ids(result.georgianTools), ['nbg-rates-mcp', 'rsge-mcp', 'claude-rs-ge-waybill-skill']);
  assert.ok(result.georgianTools.every((t) => t.status === 'listed'));
});

test('a sales manager on HubSpot and Google', () => {
  const result = person({ role: 'sales', tasks: ['sales.meetings', 'sales.pipeline'], uses: ['gmail', 'google-calendar', 'hubspot'] });
  assert.deepEqual(names(result), ['sales', 'hubspot-sales']);
  assert.deepEqual(ids(result.recommend[0].connect), ['hubspot', 'google-calendar', 'gmail']);
  assert.equal(result.recommend[0].rest, 20);
  assert.deepEqual(result.recommend[0].notInGeorgia, []);
  assert.match(result.recommend[1].overlap, /კონექტორი „HubSpot“ `sales` პლაგინშიც არის/);
});

test('a marketer who wants known publishers only', () => {
  const open = person({ role: 'marketing', tasks: ['marketing.content', 'marketing.analytics'], uses: ['group:google'] });
  assert.deepEqual(names(open), ['marketing', 'brand-voice', 'searchfit-seo']);
  const limited = person({ role: 'marketing', tasks: ['marketing.content', 'marketing.analytics'], uses: ['group:google'], limits: ['known-publishers'] });
  assert.deepEqual(names(limited), ['marketing']);
  assert.deepEqual(limited.excluded.map((e) => e.name).sort(), ['brand-voice', 'searchfit-seo']);
});

test('a lawyer who reviews contracts and looks up Georgian law', () => {
  const result = person({ role: 'legal', tasks: ['legal.contracts', 'legal.research', 'legal.signing'] });
  assert.deepEqual(names(result), ['legal', 'pdf-viewer']);
  assert.match(result.recommend[1].access.join(' '), /უშვებს პროგრამას შენს კომპიუტერზე/);
  assert.deepEqual(ids(result.georgianTools), ['ordo-mcp', 'georgia-mcp']);
  assert.deepEqual(result.uncovered, ['კანონმდებლობისა და პრაქტიკის მოძიება']);
});

test('a designer: only services have plugins for visuals, so they are mentioned and the task is said to be open', () => {
  const result = person({ role: 'marketing', tasks: ['marketing.design'] });
  assert.deepEqual(names(result), []);
  const withCopy = person({ role: 'marketing', tasks: ['marketing.design', 'marketing.content'] });
  assert.deepEqual(names(withCopy), ['marketing', 'brand-voice']);
  assert.deepEqual(withCopy.uncovered, ['ვიზუალი და პრეზენტაციები']);
  assert.deepEqual(withCopy.hints.map((h) => h.plugin), ['adobe-for-creativity', 'canva']);
});

test('an accountant is told that nothing was chosen for her tax returns', () => {
  const result = person({ role: 'finance', tasks: ['finance.books', 'finance.tax'], uses: ['group:google'], limits: ['no-money'] });
  assert.deepEqual(names(result), ['finance']);
  assert.deepEqual(result.uncovered, ['დეკლარაციები და rs.ge']);
  assert.deepEqual(ids(result.georgianTools), ['nbg-rates-mcp']);
});

test('a lawyer on Outlook, Teams and Docusign is told that nothing chosen connects Microsoft 365', () => {
  const result = person({ surface: 'claude-code', role: 'legal', tasks: ['legal.contracts', 'legal.signing', 'general.pdf'], uses: ['microsoft-365', 'docusign'], limits: ['managed'] });
  assert.deepEqual(names(result), ['legal', 'pdf-viewer']);
  assert.deepEqual(ids(result.recommend[0].connect), ['docusign']);
  assert.deepEqual(result.unconnected, ['Microsoft 365']);
  assert.match(result.notes[0], /ბრძანება უარს იტყვის/);
  const viewer = result.recommend[1];
  assert.match(viewer.access.at(-1), /არცერთ სერვისს არ უკავშირდება/);
  assert.ok(!viewer.install.steps[1].includes('/mcp'));
  assert.ok(result.recommend[0].install.steps[1].includes('/mcp'));
});

// ---- the same kinds of people in ChatGPT ------------------------------------

test('Ana, in marketing with Canva, Slack and Gmail, in the ChatGPT app on a company account', () => {
  const result = person({
    surface: 'chatgpt-app',
    role: 'marketing',
    tasks: ['marketing.design', 'marketing.analytics'],
    uses: ['canva', 'slack', 'gmail'],
    limits: ['managed'],
  });
  assert.deepEqual(result.recommend.map((i) => i.name), ['data-analytics', 'creative-production', 'canva']);
  assert.ok(result.recommend.every((i) => i.marketplace === 'openai-curated' && i.install.commands.length === 0));
  // Gmail and Slack are connectors of the bundle, and their own plugins hold nothing more.
  assert.deepEqual(result.excluded.map((e) => [e.name, e.reason]), [['gmail', 'in-bundle'], ['slack', 'in-bundle']]);
  const bundle = result.recommend[0];
  assert.deepEqual(bundle.connect.map((s) => s.id).sort(), ['gmail', 'slack']);
  // Every connector of the bundle is in one place: 2 to connect and the rest, none unaccounted for.
  assert.equal(bundle.connectors, 20);
  assert.equal(bundle.connect.length + bundle.notInGeorgia.length + bundle.rest, 20);
  assert.equal(result.notes.length, 1);
  assert.deepEqual(result.unconnected, []);
});

test('Dato, a shop owner in Codex who rules out money and already has Notion', () => {
  const dato = { surface: 'codex-cli', role: 'owner', tasks: ['owner.customers', 'owner.admin'], uses: ['shopify', 'google-drive', 'notion'], installed: ['notion@openai-curated-remote'] };
  const result = person({ ...dato, limits: ['no-money'] });
  assert.deepEqual(result.recommend.map((i) => i.name), ['google-drive']);
  // A store's orders and payouts are money: his limit leaves Shopify out, and the answer says why.
  assert.deepEqual(result.excluded.map((e) => [e.name, e.reason]), [['notion', 'installed'], ['shopify', 'no-money']]);
  assert.deepEqual(result.recommend[0].install.commands, ['codex plugin add google-drive@openai-curated-remote']);
  // Without the limit Shopify is on the list, with the warning that it works only partly in Georgia.
  const open = person(dato);
  assert.deepEqual(open.recommend.map((i) => i.name), ['google-drive', 'shopify']);
  assert.equal(open.recommend[1].warnings.length, 1);
  assert.deepEqual(open.unconnected, []);
});

test("in ChatGPT a salesperson with HubSpot gets OpenAI's Sales plugin, described from its page, and not a Claude plugin", () => {
  const sales = { surface: 'chatgpt-app', role: 'sales', tasks: ['sales.pipeline', 'sales.research'], uses: ['hubspot', 'gmail'] };
  const result = person(sales);
  assert.deepEqual(result.recommend.map((i) => i.id), ['sales@openai-curated-remote', 'gmail@openai-curated']);
  const item = result.recommend[0];
  assert.equal(item.title, 'Sales');
  assert.equal(item.skills, null);
  assert.equal(item.seen, '2026-11-19');
  // HubSpot has no plugin in the catalog: the answer says the plugin works with it and that it needs its own.
  assert.deepEqual(ids(item.connect), ['hubspot', 'gmail']);
  assert.deepEqual(result.unconnected, []);
  assert.deepEqual(item.install.commands, []);
  // The page names no skill for finding contacts, so that task is said to be left over.
  assert.equal(result.uncovered.length, 1);
  // In Codex it is installed by the id the directory lists it under.
  assert.deepEqual(person({ ...sales, surface: 'codex-cli' }).recommend[0].install.commands, ['codex plugin add sales@openai-curated-remote']);
  // A person who has it already is told so.
  const has = person({ ...sales, installed: ['sales@openai-curated-remote', 'gmail@openai-curated-remote'] });
  assert.deepEqual(has.recommend, []);
  assert.deepEqual(has.excluded.map((e) => [e.name, e.reason]), [['sales', 'installed'], ['gmail', 'installed']]);
  // In Claude the same person gets Anthropic's plugin of the same name.
  assert.equal(person({ ...sales, surface: 'claude-app' }).recommend[0].id, 'sales@knowledge-work-plugins');
});

test("the four Microsoft plugins of OpenAI's catalog all answer to Microsoft 365", () => {
  const result = person({ surface: 'chatgpt-app', role: 'legal', tasks: ['general.day'], uses: ['microsoft-365'] });
  assert.deepEqual(result.recommend.map((i) => i.name), ['outlook-calendar', 'outlook-email', 'sharepoint', 'teams']);
});
