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
for (const args of [{ keywords: ['csv'], runtime: 'browser' }, { keywords: ['transcription'], runtime: 'browser' }, { keywords: ['concurrency', 'limit'], match_all_keywords: true }]) {
  const result = await call('search_packages', args);
  results.push(result);
  const data = object(result.data);
  console.log(JSON.stringify({ args, returned: data.returned, packages: (data.packages as Json[]).map(p => ({ name: p.name, version: p.version, profile: object(p.quality).profile, signals: object(p.quality).signals, weekly_downloads: p.weekly_downloads })), filtered_counts: data.filtered_counts, duration_ms: result.duration_ms, meta: data.meta, warnings: data.warnings }));
}
const cached = await call('search_packages', { keywords: ['csv'], runtime: 'browser' });
assert.equal(object(object(cached.data).meta).cache_hit, true);
results.push(cached);
console.log(JSON.stringify({ cached_repeat_ms: cached.duration_ms, cache: object(cached.data).meta }));
const details = await call('get_package_details', { name: '@transcribe/transcriber', include_readme: true, include_dependency_summary: true });
results.push(details);
const detailData = object(details.data);
console.log(JSON.stringify({ inspected: object(detailData.package).name, version: object(detailData.package).version, readme_chars: String(object(detailData.readme).text ?? '').length, dependency_summary: detailData.dependency_summary, duration_ms: details.duration_ms, warnings: detailData.warnings }));
await mkdir('build', { recursive: true });
await writeFile('build/live-smoke-test.json', JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2) + '\n');
