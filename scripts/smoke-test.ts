import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHandler } from '../worker/index.ts';
import { object, type Json } from '../src/package-sources.ts';

const entries = new Map<string, Response>();
const cache = { match: async (key: Request) => entries.get(key.url)?.clone(), put: async (key: Request, value: Response) => { entries.set(key.url, value.clone()); } };
const handler = createHandler({ cache });
async function call(name: string, args: Json): Promise<Json> {
  const start = performance.now();
  const response = await handler.fetch(new Request('http://127.0.0.1/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }));
  const envelope = object(await response.json());
  const result = object(envelope.result);
  assert.equal(result.isError, false, JSON.stringify(result));
  const data = object(JSON.parse(object((result.content as Json[])[0]).text as string));
  return { tool: name, arguments: args, duration_ms: Math.round(performance.now() - start), data };
}
const results: Json[] = [];
for (const args of [{ keywords: ['csv'], runtime: 'browser', detail: 'full' }, { keywords: ['transcription'], runtime: 'browser', detail: 'full' }, { keywords: ['concurrency', 'limit'], match_all_keywords: true, detail: 'full' }]) {
  const result = await call('search_packages', args);
  results.push(result);
  const data = object(result.data);
  console.log(JSON.stringify({ args, returned: data.returned, packages: (data.packages as Json[]).map(p => ({ name: p.name, version: p.version, profile: object(p.quality).profile, signals: object(p.quality).signals, weekly_downloads: p.weekly_downloads })), filtered_counts: data.filtered_counts, duration_ms: result.duration_ms, meta: data.meta, warnings: data.warnings }));
}
// The default answer is the short one, and it reuses the evidence the full search just cached.
const cached = await call('search_packages', { keywords: ['csv'], runtime: 'browser' });
assert.equal(object(object(cached.data).meta).cache_hit, true);
assert.equal(object(cached.data).detail, 'compact');
assert.match(String(object(cached.data).verdict), /\w+@\d/);
results.push(cached);
console.log(JSON.stringify({ cached_repeat_ms: cached.duration_ms, verdict: object(cached.data).verdict, compact_bytes: JSON.stringify(cached.data).length, full_bytes: JSON.stringify(results[0].data).length, cache: object(cached.data).meta }));
// A job the platform already does gets the built-in first.
const builtin = await call('search_packages', { keywords: ['left pad'] });
assert.equal(object(object(builtin.data).platform).builtin, 'String.prototype.padStart()');
results.push(builtin);
console.log(JSON.stringify({ verdict: object(builtin.data).verdict, platform: object(builtin.data).platform }));
const details = await call('get_package_details', { name: '@transcribe/transcriber', include_readme: true, include_dependency_summary: true });
results.push(details);
const detailData = object(details.data);
console.log(JSON.stringify({ inspected: object(detailData.package).name, version: object(detailData.package).version, readme_chars: String(object(detailData.readme).text ?? '').length, dependency_summary: detailData.dependency_summary, duration_ms: details.duration_ms, warnings: detailData.warnings }));
await mkdir('build', { recursive: true });
await writeFile('build/live-smoke-test.json', JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2) + '\n');
