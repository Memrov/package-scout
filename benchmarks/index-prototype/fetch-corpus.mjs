// Prototype for docs/design/local-search-index.md. Needs: npm install --no-save npm-high-impact@1.13.0
// One-off: name, description and keywords for every npm-high-impact package, from npm's CDN-served /latest manifests.
import { mkdirSync, writeFileSync } from 'node:fs';
const out = new URL('../../build/index-prototype/', import.meta.url);
mkdirSync(out, { recursive: true });
const { npmHighImpact, npmTopDownloads, npmTopDependents } = await import('npm-high-impact');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const corpus = new Array(npmHighImpact.length);
let next = 0, failed = 0, t0 = Date.now();
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < npmHighImpact.length) {
    const i = next++, name = npmHighImpact[i];
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`);
        if (res.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
        if (!res.ok) { failed++; break; }
        const m = await res.json();
        corpus[i] = { name, description: typeof m.description === 'string' ? m.description.slice(0, 300) : '', keywords: Array.isArray(m.keywords) ? m.keywords.filter(k => typeof k === 'string').slice(0, 20) : [] };
        break;
      } catch { await sleep(1000); }
    }
    if (i % 2000 === 0) process.stderr.write(`${i}/${npmHighImpact.length} after ${Math.round((Date.now() - t0) / 1000)} s\n`);
  }
}));
const downloads = new Map(npmTopDownloads.map((n, i) => [n, i]));
const dependents = new Map(npmTopDependents.map((n, i) => [n, i]));
const docs = corpus.filter(Boolean).map(d => ({ ...d, downloadRank: downloads.get(d.name) ?? null, dependentsRank: dependents.get(d.name) ?? null }));
writeFileSync(new URL('corpus.json', out), JSON.stringify(docs));
process.stderr.write(`done: ${docs.length} documents, ${failed} failed, ${Math.round((Date.now() - t0) / 1000)} s\n`);
