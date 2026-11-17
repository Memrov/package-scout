import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deriveQueries, fingerprint, loadCurated } from './curated.mjs';
import { score } from './metrics.mjs';

const source = { name: 'fixture', level: '###', start: '### Alpha', stop: '## End', runtime: 'node', exclude: ['weird'] };
const markdown = `# List
### Alpha
- [Foo.js](https://github.com/a/node-foo) - Foo.
- [bar](https://github.com/b/bar) - Bar.
- [Baz Qux](https://example.com/baz) - Baz.
### Weird
- [x](https://github.com/x/x) - X.
- [y](https://github.com/y/y) - Y.
- [z](https://github.com/z/z) - Z.
### Data / Parsing
- [one](https://github.com/o/one) - 1.
## End
- [late](https://github.com/l/late) - late.
`;

test('categories become queries with every spelling of each recommended package', () => {
  const queries = deriveQueries(markdown, source);
  assert.deepEqual(queries.map(q => q.id), ['fixture:Alpha']);
  assert.deepEqual(queries[0].keywords, ['alpha']);
  assert.deepEqual(queries[0].good, ['bar', 'baz-qux', 'foo', 'foo.js', 'foojs', 'node-foo']);
  assert.ok(['dev', 'test'].includes(queries[0].split));
});

test('a pinned source that derives a different query set stops the run', async () => {
  const queries = deriveQueries(markdown, source);
  const pinned = { ...source, url: 'x', fingerprint: { queries: 1, sha256: fingerprint(queries) } };
  assert.equal((await loadCurated([pinned], { fetchText: async () => markdown })).length, 1);
  await assert.rejects(loadCurated([pinned], { fetchText: async () => markdown.replace('[bar]', '[baz]') }), /no longer derives/);
});

test('scoring counts #1, top 3 and matching built-ins by source and hint', () => {
  const queries = [{ id: 'a', good: ['x'], builtin: ['padStart'] }, { id: 'b', good: ['y'], builtin: null }];
  const results = [
    { query: 'a', source: 's', hint: false, picks: ['z', 'x'], platform: { builtin: 'String.prototype.padStart()' } },
    { query: 'b', source: 's', hint: false, picks: ['y'], platform: null },
  ];
  const all = score(queries, results).get('all|false');
  assert.deepEqual(all, { n: 2, first: 1, top3: 2, firstOrBuiltin: 2, builtinTasks: 1, builtins: 1, errors: 0 });
});

test('task queries are well formed and all in the dev split', async () => {
  const { tasks } = JSON.parse(await readFile(new URL('tasks.json', import.meta.url), 'utf8'));
  assert.equal(new Set(tasks.map(t => t.id)).size, tasks.length);
  for (const t of tasks) {
    assert.equal(t.split, 'dev');
    assert.ok(t.keywords.length && t.good.length, t.id);
    assert.ok(t.builtin === null || (Array.isArray(t.builtin) && t.builtin.length), t.id);
  }
  const { sources } = JSON.parse(await readFile(new URL('sources.json', import.meta.url), 'utf8'));
  for (const s of sources) assert.match(s.url, /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\//);
});
