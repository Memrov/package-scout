import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler as makeHandler } from './index.ts';
import { argumentsFor } from '../src/discovery.ts';
import { compareCandidates, exclusionReasons, qualityEvidence, type RankingProfile } from '../src/quality.ts';
import { object, type Json } from '../src/package-sources.ts';

const pause = async () => {};
const createHandler = (options: Parameters<typeof makeHandler>[0] = {}) => makeHandler({ ...options, bootstrap: [] });
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
type Package = { name: string; description?: string; downloads?: number; deprecated?: boolean; vulnerable?: boolean; license?: string | null; missing?: boolean; repo?: string; dependencies?: Json; scripts?: Json; cardScore?: number | null; cardDate?: string; maintainedScore?: number };
const repositoryId = (p: Package) => p.repo ?? `github.com/example/${p.name.replace(/[^a-z0-9-]/g, '')}`;
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
      return parts.length === 2 ? response({ name: p.name, readme: '# Usage\nInstall this package.' }) : response({ name: p.name, version: '1.0.0', description: p.description ?? 'CSV cache concurrency limit package for the browser', license: p.license ?? null, dependencies: p.dependencies, scripts: p.scripts,
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
        relatedProjects: [{ projectKey: { id: repositoryId(p) }, relationType: 'SOURCE_REPO', relationProvenance: 'UNVERIFIED_METADATA' }] } }) };
    }).reverse() });
    if (url.pathname === '/v3alpha/projectbatch') return response({ responses: body.requests.map((request: Json) => {
      const p = packages.find(item => repositoryId(item) === object(request.projectKey).id)!;
      return { request, project: { projectKey: request.projectKey, starsCount: 100, scorecard: p.cardScore === null ? null : { overallScore: p.cardScore ?? 7, date: p.cardDate ?? '2026-10-01T00:00:00Z', checks: [{ name: 'Maintained', score: p.maintainedScore ?? 8, reason: 'Observed provider check' }] } } };
    }) });
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

test('default production search applies shared filters, explains evidence, and deduplicates source repositories', async () => {
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
  assert.equal(object(packages[0].quality).score, null);
  assert.equal(object(packages[0].quality).profile, 'production');
  assert.equal(object(object(packages[0].quality).signals).direct_runtime_dependency_count, 0);
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

test('warm-instance caching works without provider-specific storage', async () => {
  const mock = upstream([{ name: 'good', downloads: 5000 }]);
  const handler = createHandler({ ...mock, pause, cache: null });
  const first = await call(handler, 'search_packages', { keywords: ['csv'] });
  const count = mock.calls.length;
  const second = await call(handler, 'search_packages', { keywords: ['csv'] });
  assert.equal(mock.calls.length, count);
  assert.equal(object(second.meta).cache_layer, 'memory');
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
  const evidence = qualityEvidence(candidate, 0, 'production', '2026-11-16T00:00:00Z');
  assert.equal(object(evidence.signals).direct_runtime_dependency_count, null);
  assert.equal(evidence.score, null);
  assert.equal(object(evidence.maintenance).health_score, null);
  assert.ok(Number(object(evidence.maintenance).release_age_days) > 1000);
});

test('OpenSSF scores and Maintained checks keep their original values and dates', () => {
  const base = { weekly_downloads: 10000, known_direct_advisories: [], published_at: '2026-10-01T00:00:00Z', repositories: [] };
  const card = { score: 9.3, assessed_at: '2020-01-01T00:00:00Z', checks: [{ name: 'Maintained', score: 5 }, { name: 'Code-Review', score: -1 }] };
  const candidate = { ...base, repositories: [{ id: 'github.com/example/source', scorecard: card }] };
  const before = structuredClone(candidate);
  const evidence = qualityEvidence(candidate, 0, 'production', '2026-11-16T00:00:00Z');
  assert.equal(object(evidence.signals).scorecard_score, 9.3);
  assert.equal(object(evidence.signals).maintained_check_score, 5);
  assert.equal(object(evidence.scorecard).assessed_at, card.assessed_at);
  assert.ok(Number(object(evidence.scorecard).age_days) > 1000);
  assert.equal(object(evidence.integration_effort).score, null);
  assert.equal(object(evidence.integration_effort).status, 'not_assessed');
  assert.deepEqual(candidate, before);
});

test('three profiles produce different priorities while cache entries remain isolated', async () => {
  const mock = upstream([
    { name: 'tiny-hooks', downloads: 5000, dependencies: {}, scripts: { install: 'node install.mjs' }, cardScore: 7 },
    { name: 'zero-hooks', downloads: 5000, dependencies: { a: '1', b: '1', c: '1' }, scripts: {}, cardScore: 8 },
    { name: 'strong-practices', downloads: 5000, dependencies: { a: '1', b: '1' }, scripts: { postinstall: 'node setup.mjs' }, cardScore: 10 },
  ]);
  const handler = createHandler({ ...mock, pause });
  const results = new Map<string, Json>();
  for (const profile of ['vibe', 'production', 'internal']) {
    const result = await call(handler, 'search_packages', { keywords: ['csv'], quality_profile: profile });
    assert.equal(object(result.meta).cache_hit, false);
    assert.ok((result.packages as Json[]).every(p => object(p.quality).profile === profile));
    results.set(profile, result);
  }
  const names = (profile: string) => (results.get(profile)!.packages as Json[]).map(p => p.name);
  assert.deepEqual(names('vibe'), ['tiny-hooks', 'strong-practices', 'zero-hooks']);
  assert.deepEqual(names('production'), ['strong-practices', 'zero-hooks', 'tiny-hooks']);
  assert.deepEqual(names('internal'), ['zero-hooks', 'tiny-hooks', 'strong-practices']);
  const count = mock.calls.length;
  const repeat = await call(handler, 'search_packages', { keywords: ['csv'], quality_profile: 'vibe' });
  assert.equal(mock.calls.length, count);
  assert.equal(object(repeat.meta).cache_hit, true);
  assert.deepEqual((repeat.packages as Json[]).map(p => p.name), names('vibe'));
});

test('vibe, production and internal share the same eligibility rules', () => {
  const candidate = { version: '1.0.0', deprecated: null, licenses: ['MIT'], deps_dev_status: 'found', weekly_downloads: 1000, known_direct_advisories: [{ id: 'GHSA-example' }] };
  for (const quality_profile of ['vibe', 'production', 'internal']) {
    assert.deepEqual(exclusionReasons(candidate, argumentsFor('search_packages', { keywords: ['csv'], quality_profile })), ['known_direct_advisories']);
    assert.deepEqual(exclusionReasons({ ...candidate, known_direct_advisories: [], licenses: null }, argumentsFor('search_packages', { keywords: ['csv'], quality_profile })), ['unidentified_license']);
  }
});

test('unknown metrics remain null and a valid zero is still observed evidence', () => {
  const unknown = qualityEvidence({ keyword_match_fraction: 1, repositories: [{ scorecard: { score: -1, checks: [{ name: 'Maintained', score: -1 }] } }] }, 0, 'production', '2026-11-16T00:00:00Z');
  assert.equal(object(unknown.signals).scorecard_score, null);
  assert.equal(object(unknown.signals).maintained_check_score, null);
  assert.equal(object(unknown.signals).declared_install_hook_count, null);
  const observed = qualityEvidence({ keyword_match_fraction: 1, repositories: [{ scorecard: { score: 0 } }], direct_runtime_dependency_count: 0, declared_install_hooks: [] }, 1, 'production', '2026-11-16T00:00:00Z');
  assert.equal(object(observed.signals).direct_runtime_dependency_count, 0);
  assert.equal(object(observed.signals).declared_install_hook_count, 0);
  assert.ok(compareCandidates({ quality: observed }, { quality: unknown }) < 0);
});

test('multiple source repositories cannot cherry-pick the highest Scorecard', () => {
  const evidence = qualityEvidence({ repositories: [{ id: 'github.com/example/one', scorecard: { score: 9 } }, { id: 'github.com/example/two', scorecard: { score: 4 } }] }, 0, 'production', '2026-11-16T00:00:00Z');
  assert.equal(object(evidence.signals).scorecard_score, 4);
  assert.equal(object(evidence.scorecard).source_repository, 'github.com/example/two');
  assert.deepEqual(evidence.scorecard_coverage, { associated_repositories: 2, scored_repositories: 2 });
});

test('keyword relevance precedes profile preferences and release age does not reorder otherwise equal candidates', () => {
  for (const profile of ['vibe', 'production', 'internal'] as RankingProfile[]) {
    const make = (name: string, matches: number, position: number, date: string) => ({ name, quality: qualityEvidence({ keyword_match_fraction: matches, direct_runtime_dependency_count: 0, published_at: date }, position, profile, '2026-11-16T00:00:00Z') });
    assert.ok(compareCandidates(make('exact', 1, 1, '2010-01-01'), make('partial', 0.5, 0, '2026-11-01')) < 0);
    assert.ok(compareCandidates(make('stable', 1, 0, '2010-01-01'), make('recent', 1, 1, '2026-11-01')) < 0);
  }
});

test('legacy discovery modes remain valid and production is the new default', () => {
  assert.equal(argumentsFor('search_packages', { keywords: ['csv'] }).quality_profile, 'production');
  assert.equal(argumentsFor('search_packages', { keywords: ['csv'], quality_profile: 'established' }).min_weekly_downloads, 10000);
  assert.equal(argumentsFor('search_packages', { keywords: ['csv'], quality_profile: 'explore' }).min_weekly_downloads, 0);
  assert.throws(() => argumentsFor('search_packages', { keywords: ['csv'], quality_profile: 'invalid' }));
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
