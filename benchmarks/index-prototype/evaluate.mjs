// Prototype for docs/design/local-search-index.md. Run npm run benchmark and fetch-corpus.mjs first.
// Prototype: BM25 over name (x3), keywords (x2) and description (x1), light stemming, popularity tie-break.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const root = new URL('../../', import.meta.url);
const docs = JSON.parse(readFileSync(new URL('build/index-prototype/corpus.json', root), 'utf8'));
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'of', 'to', 'in', 'on', 'with', 'js', 'javascript', 'node', 'nodejs', 'library', 'module', 'package', 'simple', 'tiny', 'fast']);
const stem = w => { for (const [s, r] of [['ies', 'y'], ['ings', ''], ['ing', ''], ['ers', ''], ['er', ''], ['es', ''], ['ed', ''], ['s', '']]) if (w.length - s.length >= 3 && w.endsWith(s)) return w.slice(0, -s.length) + r; return w; };
const tokens = text => String(text).toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t)).map(stem);
const t0 = performance.now();
const postings = new Map(); const lengths = [];
docs.forEach((d, i) => {
  const tf = new Map();
  const add = (text, weight) => { for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + weight); };
  add(d.name.replace(/^@[^/]+\//, ''), 3); add(d.keywords.join(' '), 2); add(d.description, 1);
  let len = 0; for (const [t, f] of tf) { len += f; (postings.get(t) ?? postings.set(t, []).get(t)).push([i, f]); }
  lengths.push(len);
});
const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
const buildMs = performance.now() - t0;
const popularity = d => Math.min(d.downloadRank ?? 1e6, d.dependentsRank ?? 1e6);
export function search(words, k = 100) {
  const scores = new Map();
  for (const t of new Set(words.flatMap(tokens))) {
    const list = postings.get(t); if (!list) continue;
    const idf = Math.log(1 + (docs.length - list.length + 0.5) / (list.length + 0.5));
    for (const [i, f] of list) scores.set(i, (scores.get(i) ?? 0) + idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * lengths[i] / avg)));
  }
  // Text relevance first; popularity only orders packages within 10% of each other's relevance.
  return [...scores].sort((a, b) => Math.round(b[1] * 10) - Math.round(a[1] * 10) || popularity(docs[a[0]]) - popularity(docs[b[0]])).slice(0, k).map(([i]) => docs[i].name);
}
const { queries } = JSON.parse(readFileSync(new URL('build/benchmark/results-dev.json', root), 'utf8'));
const cache = JSON.parse(readFileSync(new URL('build/benchmark/upstream.json', root), 'utf8'));
const groups = {}; const times = [];
for (const q of queries) {
  const t = performance.now(); const local = search(q.keywords); times.push(performance.now() - t);
  const key = 'GET https://registry.npmjs.org/-/v1/search?' + new URLSearchParams({ text: q.keywords.join(' '), size: '100' }) + ' ';
  const npm = (JSON.parse(cache[key].body).objects ?? []).map(o => o.package.name);
  const good = new Set(q.good); const g = groups[q.source] ??= { n: 0, npm100: 0, local100: 0, local10: 0, local1: 0, union100: 0 };
  g.n++; g.npm100 += npm.some(n => good.has(n)); g.local100 += local.some(n => good.has(n)); g.local10 += local.slice(0, 10).some(n => good.has(n)); g.local1 += good.has(local[0]); g.union100 += npm.some(n => good.has(n)) || local.some(n => good.has(n));
}
const json = JSON.stringify(docs);
times.sort((a, b) => a - b);
console.log(`index: ${docs.length} packages, ${postings.size} terms, built in ${Math.round(buildMs)} ms; corpus ${(json.length / 1e6).toFixed(1)} MB raw, ${(gzipSync(json).length / 1e6).toFixed(2)} MB gzip`);
console.log(`query latency over ${times.length} queries: median ${times[times.length >> 1].toFixed(2)} ms, max ${times.at(-1).toFixed(2)} ms`);
console.log('dev split: right answer found by retrieval');
for (const [k, g] of Object.entries(groups)) console.log(`  ${k.padEnd(19)} npm top 100 ${g.npm100}/${g.n} | local top 100 ${g.local100}/${g.n} | local top 10 ${g.local10}/${g.n} | local #1 ${g.local1}/${g.n} | npm or local top 100 ${g.union100}/${g.n}`);
