import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler as makeHandler } from './index.ts';
import { argumentsFor } from '../src/discovery.ts';
import { exclusionReasons, qualityScore } from '../src/quality.ts';
import { object, type Json } from '../src/package-sources.ts';

const pause = async () => {};
const createHandler = (options: Parameters<typeof makeHandler>[0] = {}) => makeHandler({ ...options, bootstrap: [] });
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
type Package = { name: string; description?: string; downloads?: number; deprecated?: boolean; vulnerable?: boolean; license?: string | null; missing?: boolean; repo?: string; dependencies?: Json };
function upstream(packages: Package[], listed?: string[]) {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url.toString());
    if (url.pathname === '/-/v1/search') return response({ objects: packages.filter(p => !listed || listed.includes(p.name)).map(p => ({ package: { name: p.name, description: p.description }, ...(p.downloads === undefined ? {} : { downloads: { weekly: p.downloads } }) })) });
    if (url.host === 'api.npmjs.org') {
      const name = decodeURIComponent(url.pathname.split('/').at(-1)!);
      return response({ package: name, downloads: packages.find(p => p.name === name)?.downloads });
    }
    if (url.host === 'registry.npmjs.org') {
      const parts = url.pathname.split('/').map(decodeURIComponent);
      const p = packages.find(p => p.name === parts[1]);
      if (!p) return new Response('', { status: 404 });
      return parts.length === 2 ? response({ name: p.name, readme: '# Usage\nInstall this package.' }) : response({ name: p.name, version: '1.0.0', description: p.description ?? 'CSV cache concurrency limit package for the browser', license: p.license ?? null, dependencies: p.dependencies,
        ...(p.deprecated ? { deprecated: 'Use a maintained replacement.' } : {}) });
    }
    if (url.pathname.endsWith(':dependencies')) {
      const name = decodeURIComponent(url.pathname.split('/')[5]);
      return response({ nodes: [{ versionKey: { system: 'NPM', name, version: '1.0.0' }, relation: 'SELF', errors: [] }, { versionKey: { system: 'NPM', name: 'one-dependency', version: '2.0.0' }, relation: 'DIRECT', errors: [] }], error: '' });
    }
    const body = JSON.parse(String(init?.body));
    if (url.pathname === '/v3alpha/versionbatch') return response({ responses: body.requests.map((request: Json) => {
      const key = object(request.versionKey); const p = packages.find(p => p.name === key.name)!;
      return { request, ...(p.missing ? {} : { version: { versionKey: key, licenses: p.license === null ? [] : [p.license ?? 'MIT'], advisoryKeys: p.vulnerable ? [{ id: 'GHSA-example' }] : [], publishedAt: '2026-10-01T00:00:00Z', isDeprecated: !!p.deprecated,
        relatedProjects: [{ projectKey: { id: p.repo ?? `github.com/example/${p.name.replace(/[^a-z0-9-]/g, '')}` }, relationType: 'SOURCE_REPO', relationProvenance: 'UNVERIFIED_METADATA' }] } }) };
    }).reverse() });
    if (url.pathname === '/v3alpha/projectbatch') return response({ responses: body.requests.map((request: Json) => ({ request, project: { projectKey: request.projectKey, starsCount: 100, scorecard: { overallScore: 7, date: '2026-10-01T00:00:00Z' } } })) });
    throw new Error('Unexpected upstream URL');
  };
  return { fetchImpl, calls };
}

async function rpc(handler: ReturnType<typeof createHandler>, method: string, params?: Json) {
  const res = await handler.fetch(new Request('https://scout.test/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }));
  return await res.json() as Json;
}
async function call(handler: ReturnType<typeof createHandler>, name: string, args: Json) {
  const envelope = await rpc(handler, 'tools/call', { name, arguments: args });
  const result = object(envelope.result);
  assert.equal(result.isError, false, JSON.stringify(result));
  return object(JSON.parse(object((result.content as unknown[])[0]).text as string));
}

test('MCP discovery, tool schemas, health, and the page require no upstream requests', async () => {
  const mock = upstream([]); const handler = createHandler({ ...mock, pause });
  assert.deepEqual(object((await rpc(handler, 'server/discover')).result).supportedVersions, ['2026-07-28']);
  const listed = object((await rpc(handler, 'tools/list')).result).tools as Json[];
  assert.deepEqual(listed.map(t => t.name), ['search_packages', 'get_package_details']);
  assert.equal(object(object((await rpc(handler, 'initialize')).result).capabilities).tools instanceof Object, true);
  assert.equal((await handler.fetch(new Request('https://scout.test/health'))).status, 200);
  assert.match(await (await handler.fetch(new Request('https://scout.test/'))).text(), /Package Scout/);
  assert.equal(mock.calls.length, 0);
});

test('balanced search filters junk, explains scores, and deduplicates source repositories', async () => {
  const mock = upstream([
    { name: 'deprecated', downloads: 100000, deprecated: true }, { name: 'obscure', downloads: 3 },
    { name: 'vulnerable', downloads: 100000, vulnerable: true }, { name: 'unlicensed', downloads: 1000, license: null },
    { name: 'good', downloads: 1000000, dependencies: {}, repo: 'github.com/example/shared' },
    { name: 'same-repo', downloads: 1000000, dependencies: {}, repo: 'github.com/example/shared' },
    { name: 'alternative', downloads: 10000, dependencies: { small: '^1' } },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['csv'] });
  const packages = result.packages as Json[];
  assert.deepEqual(packages.map(p => p.name), ['good', 'alternative']);
  assert.deepEqual(result.filtered_counts, { deprecated: 1, below_download_floor: 1, known_direct_advisories: 1, unidentified_license: 1, same_repository: 1 });
  assert.equal(mock.calls.some(url => url.endsWith('/obscure/latest')), false);
  assert.ok(Number(object(packages[0].quality).score) > Number(object(packages[1].quality).score));
  assert.equal(packages[0].runtime_compatibility, 'not_verified');
});

test('explore admits niche packages and unknown evidence while preserving unknown fields', async () => {
  const mock = upstream([{ name: 'niche', downloads: 1, missing: true }]);
  const handler = createHandler({ ...mock, pause });
  const balanced = await call(handler, 'search_packages', { keywords: ['cache'] });
  assert.equal(balanced.returned, 0);
  const explored = await call(handler, 'search_packages', { keywords: ['cache'], quality_profile: 'explore' });
  const candidate = (explored.packages as Json[])[0];
  assert.equal(candidate.deps_dev_status, 'not_found');
  assert.equal(candidate.known_direct_advisories, null);
  assert.equal(candidate.direct_runtime_dependency_count, null);
  assert.ok((object(candidate.quality).unknown_signals as string[]).includes('direct_advisories'));
});

test('license and established filters use observed facts and return fewer results when needed', async () => {
  const mock = upstream([{ name: 'mit', downloads: 10001, license: 'MIT' }, { name: 'apache', downloads: 10001, license: 'Apache-2.0' }]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['cache'], quality_profile: 'established', licenses_any: ['MIT'] });
  assert.deepEqual((result.packages as Json[]).map(p => p.name), ['mit']);
});

test('exact inspection can return README and a dependency summary with explicit evidence limits', async () => {
  const mock = upstream([{ name: '@scope/package', dependencies: {} }]);
  const result = await call(createHandler({ ...mock, pause }), 'get_package_details', { name: '@scope/package', version: '1.0.0', include_readme: true, include_dependency_summary: true });
  assert.equal(object(result.package).name, '@scope/package');
  assert.match(String(object(result.readme).text), /Usage/);
  assert.equal(object(result.dependency_summary).direct_nodes, 1);
  assert.equal(object(result.package).transitive_advisories, 'not_checked');
});

test('a cached repeat makes no upstream calls and preserves the evidence timestamp', async () => {
  const store = new Map<string, Response>();
  const cache = { match: async (key: Request) => store.get(key.url)?.clone(), put: async (key: Request, value: Response) => { store.set(key.url, value.clone()); } };
  const mock = upstream([{ name: 'good', downloads: 5000 }]);
  const handler = createHandler({ ...mock, pause, cache });
  const first = await call(handler, 'search_packages', { keywords: ['csv'] }); const count = mock.calls.length;
  const second = await call(handler, 'search_packages', { keywords: ['csv'] });
  assert.equal(mock.calls.length, count);
  assert.equal(object(second.meta).cache_hit, true);
  assert.equal(object(object(second.meta).upstream_requests).total, 0);
  assert.equal(object(second.meta).as_of, object(first.meta).as_of);
});

test('unknown or unsafe parameters return a tool error without network work', async () => {
  const mock = upstream([]); const handler = createHandler({ ...mock, pause });
  for (const args of [{ name: '../secret' }, { name: 'good', version: '1; echo bad' }, { name: 'good', install: true }]) {
    const result = object((await rpc(handler, 'tools/call', { name: 'get_package_details', arguments: args })).result);
    assert.equal(result.isError, true);
  }
  assert.equal(mock.calls.length, 0);
  assert.throws(() => argumentsFor('search_packages', { keywords: ['csv'], quality_profile: 'anything' }));
});

test('protocol errors and oversized bodies fail cleanly', async () => {
  const handler = createHandler({ cache: null });
  assert.equal(object((await rpc(handler, 'unknown')).error).code, -32601);
  const huge = await handler.fetch(new Request('https://scout.test/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(17000) }) }));
  assert.equal(huge.status, 400);
  assert.equal((await handler.fetch(new Request('https://scout.test/mcp'))).status, 405);
});

test('old stable packages remain eligible and unknown metrics never receive full credit', () => {
  const candidate = { name: 'stable', version: '1.0.0', deprecated: null, licenses: ['MIT'], deps_dev_status: 'found', weekly_downloads: 1000, published_at: '2018-01-01T00:00:00Z', known_direct_advisories: [], direct_runtime_dependency_count: null, repositories: [] };
  const args = argumentsFor('search_packages', { keywords: ['cache'] });
  assert.deepEqual(exclusionReasons(candidate, args), []);
  const score = qualityScore(candidate, 0, 1, '2026-11-16T00:00:00Z');
  assert.equal(object(score.components).release_recency, 2);
  assert.equal(object(score.components).dependency_footprint, 0);
  assert.ok(Number(score.score) >= 0 && Number(score.score) <= 100);
});

test('quality scores reward a smaller integration surface and discount stale Scorecards', () => {
  const base = { weekly_downloads: 10000, known_direct_advisories: [], published_at: '2026-10-01T00:00:00Z', repositories: [] };
  const small = qualityScore({ ...base, direct_runtime_dependency_count: 0 }, 0, 1, '2026-11-16T00:00:00Z');
  const large = qualityScore({ ...base, direct_runtime_dependency_count: 100 }, 0, 1, '2026-11-16T00:00:00Z');
  assert.ok(Number(small.score) > Number(large.score));
  const fresh = qualityScore({ ...base, repositories: [{ scorecard: { score: 10, assessed_at: '2026-11-01T00:00:00Z' } }] }, 0, 1, '2026-11-16T00:00:00Z');
  const stale = qualityScore({ ...base, repositories: [{ scorecard: { score: 10, assessed_at: '2020-01-01T00:00:00Z' } }] }, 0, 1, '2026-11-16T00:00:00Z');
  assert.ok(Number(fresh.score) > Number(stale.score));
});

test('keyword, runtime and package-type filters reject unrelated popular results', async () => {
  const mock = upstream([
    { name: 'popular-fetch', downloads: 10000000, description: 'Minimal HTTP request helper' },
    { name: 'n8n-nodes-csv', downloads: 100000 },
    { name: 'server-csv', downloads: 100000, description: 'CSV processing for Node.js' },
    { name: 'browser-csv', downloads: 100000 },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['csv'], runtime: 'browser' });
  assert.deepEqual((result.packages as Json[]).map(p => p.name), ['browser-csv']);
  assert.deepEqual(result.filtered_counts, { keyword_mismatch: 1, package_type: 1, no_browser_declaration: 1 });
});

test('catalog hints recover missed packages but use current manifests and download counts', async () => {
  const mock = upstream([
    { name: 'unrelated', downloads: 1000000, description: 'A fetch helper' },
    { name: 'hidden-csv', downloads: 5000, description: 'A CSV parser for the browser' },
  ], ['unrelated']);
  const handler = makeHandler({ ...mock, pause, bootstrap: [{ name: 'hidden-csv', description: 'CSV parser', keywords: ['csv'] }] });
  const result = await call(handler, 'search_packages', { keywords: ['csv'], runtime: 'browser' });
  const candidate = (result.packages as Json[])[0];
  assert.equal(candidate.name, 'hidden-csv');
  assert.equal(candidate.weekly_downloads, 5000);
  assert.equal(object(candidate.relevance_evidence).discovery_source, 'catalog_hint');
  assert.ok(mock.calls.some(url => url.startsWith('https://api.npmjs.org/downloads/point/last-week/')));
});
