import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler as makeHandler } from './index.ts';
import { argumentsFor } from '../src/discovery.ts';
import { compareCandidates, exclusionReasons, qualityEvidence, type RankingProfile } from '../src/quality.ts';
import { object, type Json } from '../src/package-sources.ts';
import { matchKeywords } from '../src/relevance.ts';
import { PLATFORM, concept, platformAnswer } from '../src/platform.ts';
import { compact, formatCount, verdictFor } from '../src/verdict.ts';
import { createRequire } from 'node:module';

const pause = async () => {};
const createHandler = (options: Parameters<typeof makeHandler>[0] = {}) => makeHandler({ ...options, bootstrap: [] });
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
type Package = { name: string; description?: string; downloads?: number; deprecated?: boolean; vulnerable?: boolean; license?: string | null; missing?: boolean; repo?: string; dependencies?: Json; scripts?: Json; cardScore?: number | null; cardDate?: string; maintainedScore?: number; manifest?: Json; emptyReadme?: boolean };
const repositoryId = (p: Package) => p.repo ?? `github.com/example/${p.name.replace(/[^a-z0-9-]/g, '')}`;
function upstream(packages: Package[], listed?: string[] | Record<string, string[]>) {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url.toString());
    if (url.pathname === '/-/v1/search') {
      const selected = Array.isArray(listed) ? listed : listed?.[url.searchParams.get('text') ?? ''];
      return response({ objects: packages.filter(p => !selected || selected.includes(p.name)).map(p => ({ package: { name: p.name, description: p.description ?? 'CSV cache concurrency limit package for the browser', keywords: p.manifest?.keywords }, ...(p.downloads === undefined ? {} : { downloads: { weekly: p.downloads } }) })) });
    }
    if (url.host === 'api.npmjs.org') {
      const name = decodeURIComponent(url.pathname.split('/').at(-1)!);
      return response({ package: name, downloads: packages.find(p => p.name === name)?.downloads });
    }
    if (url.host === 'registry.npmjs.org') {
      const parts = url.pathname.split('/').map(decodeURIComponent);
      const p = packages.find(p => p.name === parts[1]);
      if (!p) return new Response('', { status: 404 });
      return parts.length === 2 ? response({ name: p.name, readme: p.emptyReadme ? '' : '# Usage\nInstall this package.' }) : response({ name: p.name, version: '1.0.0', description: p.description ?? 'CSV cache concurrency limit package for the browser', license: p.license ?? null, dependencies: p.dependencies, scripts: p.scripts, ...p.manifest,
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
// These tests inspect ranking evidence, so searches ask for detail=full unless a test says otherwise.
async function call(handler: ReturnType<typeof createHandler>, name: string, args: Json) {
  const envelope = await rpc(handler, 'tools/call', { name, arguments: name === 'search_packages' && args.detail === undefined ? { ...args, detail: 'full' } : args });
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
  assert.deepEqual((result.packages as Json[]).map(p => p.name), ['browser-csv', 'server-csv']);
  assert.equal(object((result.packages as Json[])[1].runtime_evidence).status, 'unknown');
  assert.deepEqual(result.filtered_counts, { keyword_mismatch: 1, package_type: 1 });
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

test('browser discovery accepts web-framework peers and unknowns while rejecting explicit incompatibility', async () => {
  const mock = upstream([
    { name: 'react-editor', description: 'React editor', downloads: 10000, manifest: { peerDependencies: { react: '^19' } } },
    { name: 'portable-editor', description: 'Portable editor', downloads: 10000 },
    { name: 'server-editor', description: 'Server-only editor', downloads: 1000000 },
    { name: 'disabled-editor', description: 'Editor', downloads: 10000, manifest: { browser: false } },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['editor'], runtime: 'browser' });
  const packages = result.packages as Json[];
  assert.deepEqual(packages.map(p => p.name), ['react-editor', 'portable-editor']);
  assert.equal(object(packages[0].runtime_evidence).status, 'declared');
  assert.equal(object(packages[1].runtime_evidence).status, 'unknown');
  assert.equal(object(result.filtered_counts).runtime_incompatible, 2);
});

test('a wider metadata pool recovers candidates beyond the first ten without expanding manifest work', async () => {
  const noise = Array.from({ length: 30 }, (_, i) => ({ name: `csv-choice-${i}`, description: 'CSV parser', downloads: 5000 }));
  const mock = upstream([...noise, { name: 'established-csv', description: 'CSV parser', downloads: 10000000 }]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['csv'] });
  assert.equal((result.packages as Json[])[0].name, 'established-csv');
  assert.equal(result.candidates_considered, 31);
  assert.equal(result.candidates_inspected, 10);
  assert.equal(mock.calls.filter(url => url.endsWith('/latest')).length, 10);
  assert.equal(new URL(mock.calls[0]).searchParams.get('size'), '100');
  assert.ok(Number(object(object(result.meta).upstream_requests).total) <= 16);
});

test('primary libraries rank before unrequested adapters and error formatters', async () => {
  const mock = upstream([
    { name: 'schema-errors', description: 'JSON Schema validation error messages', downloads: 100000000, dependencies: {}, cardScore: 10 },
    { name: 'schema-validator', description: 'JSON Schema validation', downloads: 1000000, dependencies: { one: '1' }, cardScore: 5 },
  ]);
  const handler = createHandler({ ...mock, pause });
  const result = await call(handler, 'search_packages', { keywords: ['schema', 'validation'], match_all_keywords: true });
  assert.deepEqual((result.packages as Json[]).map(p => p.name), ['schema-validator', 'schema-errors']);
  assert.equal(object((result.packages as Json[])[1].role_evidence).supporting, true);
  const specific = await call(handler, 'search_packages', { keywords: ['schema', 'errors'], match_all_keywords: true });
  assert.equal((specific.packages as Json[])[0].name, 'schema-errors');
  assert.equal(object((specific.packages as Json[])[0].role_evidence).supporting, false);
});

test('name and description matches precede broad keyword tags', async () => {
  const mock = upstream([
    { name: 'concurrency-control', description: 'Limit concurrent tasks', downloads: 100000000, manifest: { keywords: ['rate', 'limit'] } },
    { name: 'request-limiter', description: 'Request rate limit middleware', downloads: 1000000 },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['rate', 'limit'], match_all_keywords: true });
  assert.equal((result.packages as Json[])[0].name, 'request-limiter');
});

test('adoption tiers prevent a tiny known footprint dominating established unknown footprints', async () => {
  const mock = upstream([
    { name: 'small-decimal', description: 'Decimal arithmetic', downloads: 500, dependencies: {} },
    { name: 'established-decimal', description: 'Decimal arithmetic', downloads: 50000000 },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['decimal'], quality_profile: 'vibe', niche: true });
  const first = (result.packages as Json[])[0];
  assert.equal(first.name, 'established-decimal');
  assert.equal(first.direct_runtime_dependency_count, null);
});

test('simple plurals retain useful matches without boosting a generic category name above relevance', async () => {
  const mock = upstream([
    { name: 'chart', description: 'A chart library', downloads: 500 },
    { name: 'other-chart', description: 'A chart library', downloads: 1000000 },
  ]);
  const handler = createHandler({ ...mock, pause });
  assert.equal((await call(handler, 'search_packages', { keywords: ['charts'], niche: true })).returned, 2);
  assert.equal(((await call(handler, 'search_packages', { keywords: ['chart'], niche: true })).packages as Json[])[0].name, 'other-chart');
});

test('valid array export fallbacks do not crash runtime inspection and native peers stay explicit', async () => {
  const mock = upstream([
    { name: 'portable-image', description: 'Image compression', downloads: 10000, manifest: { exports: { '.': ['./index.js', { browser: './browser.js' }] } } },
    { name: 'native-image', description: 'Image compression', downloads: 100000, manifest: { peerDependencies: { react: '*', 'react-native': '*' } } },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['image'], runtime: 'browser' });
  assert.deepEqual((result.packages as Json[]).map(p => p.name), ['portable-image']);
  assert.equal(object(result.filtered_counts).runtime_incompatible, 1);
});

test('search omits verbose Scorecard checks while exact details retain them', async () => {
  const mock = upstream([{ name: 'csv-parser', downloads: 10000 }]);
  const handler = createHandler({ ...mock, pause });
  const search = await call(handler, 'search_packages', { keywords: ['csv'] });
  const card = object(((search.packages as Json[])[0].repositories as Json[])[0].scorecard);
  assert.equal(card.score, 7);
  assert.equal(card.checks, undefined);
  const details = await call(handler, 'get_package_details', { name: 'csv-parser' });
  assert.equal((object((object(details.package).repositories as Json[])[0].scorecard).checks as Json[])[0].name, 'Maintained');
});

test('an empty README is explicitly missing and generates a warning', async () => {
  const mock = upstream([{ name: 'empty-docs', emptyReadme: true }]);
  const result = await call(createHandler({ ...mock, pause }), 'get_package_details', { name: 'empty-docs', include_readme: true });
  assert.equal(object(result.readme).status, 'missing');
  assert.match(String((result.warnings as string[])[0]), /no README/);
});

test('normal discovery excludes low-download packages while niche mode retains every other safeguard', async () => {
  const mock = upstream([
    { name: 'small-csv', downloads: 833, description: 'CSV parser' },
    { name: 'unsafe-csv', downloads: 900, description: 'CSV parser', vulnerable: true },
    { name: 'unknown-license-csv', downloads: 900, description: 'CSV parser', license: null },
    { name: 'unknown-version-csv', downloads: 900, description: 'CSV parser', license: 'MIT', missing: true },
  ]);
  const handler = createHandler({ ...mock, pause });
  const normal = await call(handler, 'search_packages', { keywords: ['csv'] });
  assert.equal(normal.returned, 0);
  const niche = await call(handler, 'search_packages', { keywords: ['csv'], niche: true });
  assert.deepEqual((niche.packages as Json[]).map(p => p.name), ['small-csv']);
  assert.equal(object(niche.filtered_counts).known_direct_advisories, 1);
  assert.equal(object(niche.filtered_counts).unidentified_license, 1);
  assert.equal(object(niche.filtered_counts).missing_version_evidence, 1);
  assert.equal(object(niche.meta).cache_hit, false);
  assert.equal(niche.next_search, undefined);
  assert.throws(() => argumentsFor('search_packages', { keywords: ['csv'], niche: 'yes' }));
});

test('explicit strict matching preserves every required concept', async () => {
  const mock = upstream([
    { name: 'ofx-parser', downloads: 5000, description: 'OFX statement parser' },
    { name: 'body-parser', downloads: 100000000, description: 'HTTP body parser' },
  ]);
  const handler = createHandler({ ...mock, pause });
  const exact = await call(handler, 'search_packages', { keywords: ['ofx', 'parser'], match_all_keywords: true });
  assert.deepEqual((exact.packages as Json[]).map(p => p.name), ['ofx-parser']);
  const broad = await call(handler, 'search_packages', { keywords: ['ofx', 'parser'], match_all_keywords: false });
  assert.equal(broad.returned, 2);
});

test('default soft matching recovers sparse metadata and exposes unmatched concepts and publisher keywords', async () => {
  const mock = upstream([
    { name: 'nsfwjs', downloads: 80000, description: 'Detect NSFW content client-side', manifest: { keywords: ['NSFW', 'JavaScript'] } },
    { name: 'image-detector', downloads: 10000, description: 'Detect NSFW images' },
    { name: 'unrelated', downloads: 1000000, description: 'HTTP client' },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['image', 'nsfw'] });
  assert.equal(object(result.constraints).match_all_keywords, false);
  assert.equal(object(result.search).keyword_policy, 'soft');
  const candidate = (result.packages as Json[]).find(p => p.name === 'nsfwjs')!;
  assert.ok(candidate);
  assert.deepEqual(object(candidate.relevance_evidence).unmatched_keywords, ['image']);
  assert.equal(object(candidate.relevance_evidence).match_type, 'partial');
  assert.deepEqual(candidate.keywords, ['NSFW', 'JavaScript']);
  assert.equal((result.packages as Json[]).some(p => p.name === 'unrelated'), false);
});

test('multiword operation phrases retain direction instead of matching a reversed operation', () => {
  assert.deepEqual(matchKeywords({ name: 'speech-to-text', description: 'Transcribe microphone input' }, ['text to speech']), []);
  assert.deepEqual(matchKeywords({ name: 'text-to-speech' }, ['text to speech']), ['text to speech']);
  assert.deepEqual(matchKeywords({ description: 'Cross browser Speech Synthesis' }, ['speech synthesis']), ['speech synthesis']);
});

test('soft matching keeps a distinctive task term ahead of generic high-download category matches', async () => {
  const mock = upstream([
    ...Array.from({ length: 11 }, (_, i) => ({ name: `image-utility-${i}`, downloads: 10000000, description: 'Image dimensions and processing' })),
    { name: 'nsfwjs', downloads: 80000, description: 'Detect NSFW content client-side' },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['image', 'nsfw'] });
  assert.equal((result.packages as Json[])[0].name, 'nsfwjs');
  assert.equal(result.candidates_inspected, 10);
});

test('legacy registry names remain inspectable and an unsupported search row cannot abort the query', async () => {
  const mock = upstream(['Sentimental', '@_linked/translation', 'nodeQuery', 'DOMArray'].map(name => ({ name, downloads: 10000, description: 'Useful text utility' })));
  const fetchImpl: typeof fetch = async (url, init) => {
    const res = await mock.fetchImpl(url, init);
    if (new URL(String(url)).pathname !== '/-/v1/search') return res;
    const data = await res.json() as { objects: Json[] };
    return response({ objects: [...data.objects, { package: { name: '../../invalid' } }] });
  };
  const handler = createHandler({ fetchImpl, pause });
  const found = await call(handler, 'search_packages', { keywords: ['utility'] });
  assert.equal(found.returned, 3);
  assert.equal(object(found.filtered_counts).unsupported_search_record, 1);
  for (const name of ['Sentimental', '@_linked/translation', 'nodeQuery', 'DOMArray']) {
    assert.equal(object((await call(handler, 'get_package_details', { name })).package).name, name);
  }
  for (const name of ['../bad', '@../bad', '@scope/..', '@scope/pkg/extra']) assert.throws(() => argumentsFor('get_package_details', { name }));
});

test('a missing Scorecard does not outrank stronger adoption in an otherwise tied production search', async () => {
  const mock = upstream([
    { name: 'established-ocr', downloads: 90000, description: 'OCR library', cardScore: null },
    { name: 'scored-ocr', downloads: 11000, description: 'OCR library', cardScore: 10 },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['ocr'] });
  assert.equal((result.packages as Json[])[0].name, 'established-ocr');
  assert.equal(object(object((result.packages as Json[])[0].quality).signals).scorecard_score, null);
});

test('send requests prefer messaging libraries over calculators and testing utilities', async () => {
  const mock = upstream([
    { name: 'sms-calculator', downloads: 900000, description: 'Calculate SMS segments to send', cardScore: 10 },
    { name: 'sms-tests', downloads: 900000, description: 'Send SMS for testing in continuous integration', cardScore: 10 },
    { name: 'sms-client', downloads: 10000, description: 'Send SMS messages to customers', cardScore: null },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['sms', 'send'] });
  assert.equal((result.packages as Json[])[0].name, 'sms-client');
});

test('a sparse discovery tries one tagged search, deduplicates, and preserves relevance and runtime', async () => {
  const mock = upstream([
    { name: 'first-csv', downloads: 5000, description: 'CSV parser for the browser' },
    { name: 'recovered-csv', downloads: 5000, description: 'CSV parser for the browser' },
    { name: 'generic-parser', downloads: 10000000, description: 'HTTP body parser' },
    { name: 'node-csv', downloads: 10000000, description: 'Server-only CSV parser' },
  ], { 'csv parser': ['first-csv'], 'keywords:csv': ['first-csv', 'recovered-csv', 'generic-parser', 'node-csv'] });
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['csv', 'parser'], runtime: 'browser', match_all_keywords: true });
  assert.deepEqual((result.packages as Json[]).map(p => p.name), ['first-csv', 'recovered-csv']);
  assert.equal(object(result.search).fallback_used, true);
  assert.equal(mock.calls.filter(url => new URL(url).pathname === '/-/v1/search').length, 2);
  assert.equal(mock.calls.filter(url => url.endsWith('/first-csv/latest')).length, 1);
});

test('three screened candidates avoid extra discovery even when final safeguards leave fewer results', async () => {
  const mock = upstream([
    { name: 'safe-csv', downloads: 5000, description: 'CSV parser' },
    { name: 'risky-csv-one', downloads: 5000, description: 'CSV parser', vulnerable: true },
    { name: 'risky-csv-two', downloads: 5000, description: 'CSV parser', vulnerable: true },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['csv'] });
  assert.deepEqual((result.packages as Json[]).map(p => p.name), ['safe-csv']);
  assert.equal(object(result.search).fallback_used, false);
  assert.equal(mock.calls.filter(url => new URL(url).pathname === '/-/v1/search').length, 1);
});

test('a failed alternate search preserves primary evidence and makes no further search attempts', async () => {
  const mock = upstream([{ name: 'first-csv', downloads: 5000, description: 'CSV parser' }]);
  let searches = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    if (new URL(String(url)).pathname === '/-/v1/search' && ++searches > 1) return new Response('', { status: 429, headers: { 'Retry-After': '60' } });
    return mock.fetchImpl(url, init);
  };
  const result = await call(createHandler({ fetchImpl, pause }), 'search_packages', { keywords: ['csv'] });
  assert.deepEqual((result.packages as Json[]).map(p => p.name), ['first-csv']);
  assert.equal(searches, 2);
  assert.equal(object(result.search).fallback_status, 'unavailable');
  assert.ok((result.warnings as string[]).some(w => /alternate search/i.test(w)));
});

test('a fallback reserves its request allowance while supplemental hints and ten manifests remain bounded', async () => {
  const discovered = Array.from({ length: 11 }, (_, i) => ({ name: `found-csv-${i}`, downloads: 10000, description: 'CSV parser' }));
  const hinted = Array.from({ length: 3 }, (_, i) => ({ name: `hint-csv-${i}`, downloads: 10000, description: 'CSV parser' }));
  const mock = upstream([...discovered, ...hinted], {
    'csv parser': ['found-csv-0'], 'keywords:csv': discovered.map(p => p.name),
  });
  const result = await call(makeHandler({ ...mock, pause, bootstrap: hinted }), 'search_packages', { keywords: ['csv', 'parser'] });
  assert.equal(result.returned, 3);
  assert.equal(result.candidates_inspected, 10);
  assert.equal(mock.calls.filter(url => url.endsWith('/latest')).length, 10);
  assert.ok(Number(object(object(result.meta).upstream_requests).total) <= 16);
  assert.equal(mock.calls.length, 16);
});

test('a short mainstream result supplies valid niche retry arguments without losing caller constraints', async () => {
  const mock = upstream([{ name: 'first-csv', downloads: 5000, description: 'CSV parser', license: 'MIT' }]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', {
    keywords: ['csv'], runtime: 'browser', quality_profile: 'vibe', licenses_any: ['MIT'], include_prerelease: true,
  });
  assert.deepEqual(result.next_search, { keywords: ['csv'], runtime: 'browser', niche: true, quality_profile: 'vibe', licenses_any: ['MIT'], include_prerelease: true, detail: 'full' });
  const retry = argumentsFor('search_packages', result.next_search);
  assert.equal(retry.min_weekly_downloads, 0);
  assert.deepEqual(retry.licenses_any, ['MIT']);
});

test('a multi-concept fallback searches the primary tag without intersecting every keyword', async () => {
  const mock = upstream([]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', {
    keywords: ['concurrency', 'limitation', 'throughput', 'semaphore', 'parallel', 'queue'],
  });
  assert.equal(result.returned, 0);
  const queries = mock.calls.filter(url => new URL(url).pathname === '/-/v1/search').map(url => new URL(url).searchParams.get('text')!);
  assert.equal(queries.length, 2);
  assert.equal(queries[1], 'keywords:concurrency');
  assert.deepEqual(object(result.constraints).keywords, ['concurrency', 'limitation', 'throughput', 'semaphore', 'parallel', 'queue']);
});

test('niche retry preserves an explicit strict keyword constraint', async () => {
  const mock = upstream([{ name: 'small-csv', downloads: 50, description: 'CSV parser' }]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['csv', 'parser'], match_all_keywords: true });
  assert.equal(object(result.next_search).match_all_keywords, true);
  assert.equal(argumentsFor('search_packages', result.next_search).match_all_keywords, true);
});

test('a legacy manifest with array-style engines cannot abort a search', async () => {
  const mock = upstream([
    { name: 'cordova-pdf', downloads: 50000, description: 'PDF generator plugin', manifest: { engines: [{ name: 'cordova', version: '>=3.0.0' }] } },
    { name: 'node-pdf', downloads: 40000, description: 'PDF generator', manifest: { engines: { node: '>=18' } } },
  ]);
  const handler = createHandler({ ...mock, pause });
  for (const runtime of ['any', 'node', 'browser']) {
    const result = await call(handler, 'search_packages', { keywords: ['pdf generator'], runtime });
    assert.equal(result.returned, 2, runtime);
  }
  const node = await call(handler, 'search_packages', { keywords: ['pdf generator'], runtime: 'node' });
  const status = (name: string) => object((node.packages as Json[]).find(p => p.name === name)!.runtime_evidence).status;
  assert.equal(status('node-pdf'), 'declared');
  assert.equal(status('cordova-pdf'), 'unknown');
});

test('initialize negotiates a protocol version that stable MCP clients accept', async () => {
  const handler = createHandler({ cache: null });
  const version = async (params?: Json) => object((await rpc(handler, 'initialize', params)).result).protocolVersion;
  assert.equal(await version({ protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'client', version: '1' } }), '2025-11-25');
  assert.equal(await version({ protocolVersion: '2025-06-18' }), '2025-06-18');
  assert.equal(await version({ protocolVersion: '2026-07-28' }), '2026-07-28');
  // Unknown or unsupported requests get the server's latest, as the specification requires.
  assert.equal(await version({ protocolVersion: '2024-11-05' }), '2026-07-28');
  assert.equal(await version({ protocolVersion: 42 }), '2026-07-28');
  assert.equal(await version(), '2026-07-28');
  const initialized = await handler.fetch(new Request('https://scout.test/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }));
  assert.equal(initialized.status, 202);
});

// Short answers, verdicts and built-in platform answers.

test('the default answer is compact: a verdict, the picks, and a fraction of the full evidence', async () => {
  const mock = upstream([
    { name: 'papa', downloads: 25501733, dependencies: {}, description: 'CSV parser for the browser' },
    { name: 'second-csv', downloads: 400000, dependencies: { one: '1' }, description: 'CSV parser for the browser' },
    { name: 'third-csv', downloads: 50000, description: 'CSV parser for the browser' },
  ]);
  const handler = createHandler({ ...mock, pause });
  const short = await call(handler, 'search_packages', { keywords: ['csv'], detail: 'compact' });
  const count = mock.calls.length;
  const full = await call(handler, 'search_packages', { keywords: ['csv'] });
  assert.equal(mock.calls.length, count, 'compact and full answers share one cached lookup');
  assert.equal(short.detail, 'compact');
  assert.equal(short.verdict, full.verdict);
  assert.match(String(short.verdict), /^Scout's pick: papa@1\.0\.0\. 25\.5M downloads a week, MIT, zero dependencies, no known direct advisories\. /);
  assert.equal(short.platform, null);
  const first = (short.packages as Json[])[0];
  assert.deepEqual(Object.keys(first), ['name', 'version', 'install', 'description', 'weekly_downloads', 'licenses', 'dependencies', 'runtime', 'match', 'published_at', 'openssf_scorecard', 'npm_url', 'repository']);
  assert.equal(first.install, 'npm install papa@1.0.0');
  assert.equal(first.openssf_scorecard, 7);
  assert.equal(first.repository, 'https://github.com/example/papa');
  assert.equal(short.filtered_counts, undefined);
  assert.equal(short.scoring, undefined);
  assert.ok(object(short.meta).as_of);
  assert.ok(object(short.attribution).provider);
  assert.ok(JSON.stringify(short).length * 4 < JSON.stringify(full).length, 'the compact answer is under a quarter of the full one');
});

test('the REST search endpoint also answers compactly unless full detail is requested', async () => {
  const mock = upstream([{ name: 'good-csv', downloads: 50000, description: 'CSV parser' }]);
  const handler = createHandler({ ...mock, pause });
  const post = async (body: Json) => (await handler.fetch(new Request('https://scout.test/v1/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))).json() as Promise<Json>;
  const short = await post({ keywords: ['csv'] });
  assert.equal(short.detail, 'compact');
  assert.equal(typeof short.verdict, 'string');
  const full = await post({ keywords: ['csv'], detail: 'full' });
  assert.equal(full.detail, undefined);
  assert.ok(object((full.packages as Json[])[0].quality).signals);
  assert.equal(object(full.constraints).detail, undefined);
  assert.match(String((await post({ keywords: ['csv'], detail: 'everything' })).error), /detail must be compact or full/);
});

test('cautions say what to watch for, and only when there is something to watch', async () => {
  const mock = upstream([
    { name: 'heavy-editor', description: 'Rich editor', downloads: 5000, scripts: { postinstall: 'node build.js' }, dependencies: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`dep-${i}`, '1'])) },
    { name: 'editor-adapter', description: 'Editor adapter for a framework', downloads: 900000, dependencies: {} },
  ]);
  const result = await call(createHandler({ ...mock, pause }), 'search_packages', { keywords: ['editor', 'markdown'], runtime: 'browser', detail: 'compact' });
  const byName = new Map((result.packages as Json[]).map(p => [p.name, p]));
  const heavy = byName.get('heavy-editor')!;
  assert.equal(heavy.match, 'partial');
  assert.deepEqual(heavy.unmatched_keywords, ['markdown']);
  assert.deepEqual(heavy.cautions, [
    'Metadata mentions "editor" but not "markdown".', 'No browser support is declared. Check the README.',
    'Runs install scripts: postinstall.', 'Small crowd: 5K downloads a week.', 'Brings 12 direct dependencies.',
  ]);
  assert.ok((byName.get('editor-adapter')!.cautions as string[]).some(note => /^Role hint: adapter\./.test(note)));
  assert.match(String(result.verdict), /^Partial match: /);
  assert.match(String(result.verdict), /Read its README before you trust it\.$/);
});

test('the verdict hedges a small crowd and admits when nothing clears the bar', async () => {
  const mock = upstream([{ name: 'tiny-ofx', downloads: 2000, description: 'OFX statement parser', dependencies: {} }]);
  const handler = createHandler({ ...mock, pause });
  const small = await call(handler, 'search_packages', { keywords: ['ofx'], detail: 'compact' });
  assert.equal(small.verdict, 'Closest fit: tiny-ofx@1.0.0, but it is a small crowd. 2K downloads a week, MIT, zero dependencies, no known direct advisories. Read its README before you trust it.');
  const none = await call(handler, 'search_packages', { keywords: ['quantum', 'toaster'], detail: 'compact' });
  assert.equal(none.returned, 0);
  assert.equal(none.verdict, 'Nothing clears Scout\'s bar for "quantum" and "toaster". Retry with next_search to include small packages, or try another keyword.');
  assert.deepEqual(none.next_search, { keywords: ['quantum', 'toaster'], runtime: 'any', niche: true });
  const still = await call(handler, 'search_packages', { keywords: ['quantum', 'toaster'], niche: true, detail: 'compact' });
  assert.equal(still.verdict, 'Nothing clears Scout\'s bar for "quantum" and "toaster". Try another keyword. Or, tragically, write it yourself.');
});

test('a job the platform already does is answered with the built-in before any package', async () => {
  const mock = upstream([{ name: 'pad-left', downloads: 983480, description: 'Left pad a string with zeros', dependencies: { repeat: '1' } }]);
  const handler = createHandler({ ...mock, pause });
  const result = await call(handler, 'search_packages', { keywords: ['left pad'], detail: 'compact' });
  assert.equal(result.verdict, "Don't install anything: String.prototype.padStart() is built in. If that is not enough, Scout's pick is pad-left@1.0.0.");
  const platform = object(result.platform);
  assert.equal(platform.builtin, 'String.prototype.padStart()');
  assert.match(String(platform.docs), /^https:\/\/developer\.mozilla\.org\//);
  assert.equal((result.packages as Json[])[0].name, 'pad-left');
  const full = await call(handler, 'search_packages', { keywords: ['left pad'] });
  assert.deepEqual(full.platform, result.platform);
  const nodeOnly = await call(handler, 'search_packages', { keywords: ['argument parser'], runtime: 'node', detail: 'compact' });
  assert.equal(nodeOnly.verdict, "Don't install anything: util.parseArgs() is built in to Node.");
});

test('platform answers are strict: one listed concept, the right runtime, and nothing the built-in cannot do', () => {
  const builtin = (keywords: string[], runtime = 'any') => platformAnswer(keywords, runtime)?.builtin ?? null;
  assert.equal(builtin(['uuid']), 'crypto.randomUUID()');
  assert.equal(builtin(['uuid', 'generate']), 'crypto.randomUUID()');
  assert.equal(builtin(['UUID generator', 'javascript']), 'crypto.randomUUID()');
  assert.equal(builtin(['uuid', 'validate']), null);
  assert.equal(builtin(['uuid v7']), null);
  assert.equal(builtin(['pad', 'left']), 'String.prototype.padStart()');
  assert.equal(builtin(['deep clone']), 'structuredClone()');
  assert.equal(builtin(['clone', 'repository']), null);
  assert.equal(builtin(['date picker'], 'browser'), '<input type="date">');
  assert.equal(builtin(['date picker']), '<input type="date">');
  assert.equal(builtin(['date picker'], 'node'), null);
  assert.equal(builtin(['date range picker'], 'browser'), null);
  assert.equal(builtin(['deep equal'], 'browser'), null);
  assert.equal(builtin(['deep equal', 'browser']), null);
  assert.equal(builtin(['deep equal'], 'node'), 'util.isDeepStrictEqual()');
  assert.equal(builtin(['copy to clipboard'], 'browser'), 'navigator.clipboard.writeText()');
  assert.equal(builtin(['is odd']), 'the % operator');
  assert.equal(builtin(['fetch timeout']), 'AbortSignal.timeout()');
  for (const rabbitHole of [['csv parser'], ['password', 'hash'], ['timezone'], ['pdf', 'generate'], ['markdown parser'], ['date'], ['fetch', 'retry'], ['hash']]) {
    assert.equal(builtin(rabbitHole), null, rabbitHole.join(' '));
  }
});

test('every built-in in the catalog is well formed, unambiguous, and actually works', async () => {
  const require = createRequire(import.meta.url);
  const ids = new Set<string>(); const phrases = new Map<string, string>();
  for (const entry of PLATFORM) {
    assert.equal(ids.has(entry.id), false, `duplicate id ${entry.id}`); ids.add(entry.id);
    assert.ok(entry.runtimes.length && entry.runtimes.every(runtime => runtime === 'browser' || runtime === 'node'), entry.id);
    assert.match(entry.docs, /^https:\/\/(developer\.mozilla\.org|nodejs\.org)\//, entry.id);
    assert.ok(entry.builtin && entry.example && entry.phrases.length, entry.id);
    for (const phrase of entry.phrases) {
      const key = [...new Set(concept(phrase))].sort().join(' ');
      assert.ok(key, `${entry.id}: empty phrase`);
      assert.ok(!phrases.has(key) || phrases.get(key) === entry.id, `"${phrase}" is claimed by ${phrases.get(key)} and ${entry.id}`);
      phrases.set(key, entry.id);
      assert.equal(platformAnswer([phrase], entry.runtimes[0])?.builtin, entry.builtin, `"${phrase}" should find ${entry.id}`);
    }
    // Browser markup cannot run here. Everything that claims to work on Node must prove it.
    assert.equal(typeof entry.verify === 'string', entry.runtimes.includes('node'), `${entry.id}: verify`);
    if (entry.verify) assert.equal(await new Function('require', `return (${entry.verify});`)(require), true, `${entry.id}: ${entry.verify}`);
  }
});

test('download counts read the way a person would say them', () => {
  assert.deepEqual([833, 1000, 6813, 45100, 99960, 475886, 999960, 25501733, 394395796, 1181300000].map(formatCount),
    ['833', '1K', '6.8K', '45.1K', '100K', '476K', '1M', '25.5M', '394M', '1.2B']);
  const result = { packages: [{ name: 'x', version: '2.0.0', weekly_downloads: 12000, licenses: null, direct_runtime_dependency_count: null, known_direct_advisories: null, relevance_evidence: { match_type: 'complete' } }], platform: null };
  assert.match(verdictFor(result), /^Scout's pick: x@2\.0\.0\. 12K downloads a week\. /);
  assert.equal(compact({ ...result, verdict: 'kept', packages: [], warnings: [], meta: {}, attribution: {}, evidence_limits: '' }).verdict, 'kept');
});
