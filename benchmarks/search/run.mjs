#!/usr/bin/env node
// Search-quality benchmark. Usage:
//   npm run benchmark                     dev split, replaying recorded upstream data when present
//   npm run benchmark -- --split test     the held-out split: report it once per decision, never tune on it
//   npm run benchmark -- --record         fetch npm and deps.dev live and overwrite the recording
//   npm run benchmark -- --baseline FILE  list answers that changed against an earlier results file
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCurated } from './curated.mjs';
import { score } from './metrics.mjs';

const root = new URL('../../', import.meta.url);
const out = new URL('build/benchmark/', root);
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const split = option('--split') ?? 'dev';
if (!['dev', 'test', 'all'].includes(split)) throw new Error('--split must be dev, test or all');
const record = args.includes('--record');
const recording = new URL('upstream.json', out);
await mkdir(out, { recursive: true });

// One recorded copy of every upstream response, so two versions of Scout can be compared on identical data.
const cache = record ? {} : JSON.parse(await readFile(recording, 'utf8').catch(() => '{}'));
const sleep = ms => new Promise(done => setTimeout(done, ms));
let lastSearch = 0, live = 0;
async function upstream(url, init = {}) {
  const key = `${init.method ?? 'GET'} ${url} ${init.body ?? ''}`;
  if (!cache[key]) {
    const search = String(url).includes('/-/v1/search');
    for (let attempt = 0; ; attempt++) {
      // npm's search endpoint rate-limits bursts; everything else is a cached CDN or batch endpoint.
      if (search) { const wait = lastSearch + 1500 - Date.now(); if (wait > 0) await sleep(wait); lastSearch = Date.now(); }
      const res = await fetch(url, { method: init.method, headers: init.headers, body: init.body, redirect: 'manual' });
      const body = await res.text();
      live++;
      if (res.status === 429 && attempt < 5) { await sleep(20000 * (attempt + 1)); continue; }
      cache[key] = { status: res.status, body, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } };
      break;
    }
  }
  const hit = cache[key];
  return new Response(hit.body, { status: hit.status, headers: hit.headers });
}

// The pinned lists are small; they are fetched each run rather than written to disk.
async function fetchText(url) {
  if (!/^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[0-9a-f]{40}\/[\w./-]+$/.test(url)) throw new Error(`Unexpected list URL ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const tasks = JSON.parse(await readFile(new URL('tasks.json', import.meta.url), 'utf8')).tasks.map(task => ({ ...task, source: 'tasks' }));
const { sources } = JSON.parse(await readFile(new URL('sources.json', import.meta.url), 'utf8'));
const queries = [...tasks, ...await loadCurated(sources, { fetchText })].filter(q => split === 'all' || q.split === split);

const { createHandler } = await import(new URL('worker/index.ts', root).href);
const handler = createHandler({ fetchImpl: upstream, cache: null });
const results = [];
for (const q of queries) {
  // Warm both searches Scout can make, paced, so a rate limit cannot hit inside a request's deadline.
  const tag = (q.keywords[0].toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 6).join('-');
  await upstream(`https://registry.npmjs.org/-/v1/search?${new URLSearchParams({ text: q.keywords.join(' '), size: '100' })}`);
  if (tag) await upstream(`https://registry.npmjs.org/-/v1/search?${new URLSearchParams({ text: `keywords:${tag}`, size: '100' })}`);
  for (const hint of [false, true]) {
    const body = { keywords: q.keywords, limit: 3, ...(hint && q.runtime ? { runtime: q.runtime } : {}) };
    const res = await handler.fetch(new Request('http://scout.local/v1/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    const data = await res.json();
    results.push({ query: q.id, split: q.split, source: q.source, hint, picks: (data.packages ?? []).map(p => p.name), platform: data.platform ?? null, verdict: data.verdict ?? null, error: data.error ?? null });
  }
}
await writeFile(recording, JSON.stringify(cache));

const groups = score(queries, results);
console.log(`Split: ${split}. ${queries.length} queries, each with and without a runtime hint. Live upstream requests: ${live}.`);
console.log(`${'group'.padEnd(26)}${'right at #1'.padStart(13)}${'in top 3'.padStart(11)}${'#1 or built-in'.padStart(16)}${'built-ins'.padStart(11)}${'errors'.padStart(8)}`);
for (const [key, g] of [...groups].sort()) {
  const [source, hint] = key.split('|');
  const pct = n => `${n}/${g.n}`.padStart(9) + ` ${String(Math.round(100 * n / g.n)).padStart(2)}%`;
  console.log(`${`${source}${hint === 'true' ? ' + hint' : ''}`.padEnd(26)}${pct(g.first)}${pct(g.top3).padStart(11)}${pct(g.firstOrBuiltin).padStart(16)}${(g.builtinTasks ? `${g.builtins}/${g.builtinTasks}` : '-').padStart(11)}${String(g.errors).padStart(8)}`);
}
const file = option('--out') ? new URL(option('--out'), `file://${process.cwd()}/`) : new URL(`results-${split}.json`, out);
await writeFile(file, JSON.stringify({ split, queries, results }, null, 1) + '\n');
console.log(`Results: ${fileURLToPath(file)}`);

const baseline = option('--baseline');
if (baseline) {
  const before = new Map(JSON.parse(await readFile(baseline, 'utf8')).results.map(r => [`${r.query}|${r.hint}`, r]));
  let changed = 0;
  for (const r of results) {
    const b = before.get(`${r.query}|${r.hint}`);
    if (!b) continue;
    const was = `${b.platform?.builtin ? `[${b.platform.builtin}] ` : ''}${b.picks.join(', ')}`;
    const now = `${r.platform?.builtin ? `[${r.platform.builtin}] ` : ''}${r.picks.join(', ')}`;
    if (was !== now) { changed++; console.log(`  ${r.query}${r.hint ? ' + hint' : ''}: ${was} -> ${now}`); }
  }
  console.log(`${changed} changed answers against ${baseline}`);
}
process.exit(0);
