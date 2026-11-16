import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PackageSources, type Json } from '../src/package-sources.ts';
import { collectCatalog, readCatalog, validateSeeds, writeCatalog } from './refresh-catalog.ts';

const pause = async () => {};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const seeds = (names = ['alpha'], limits: Json = {}) => validateSeeds({
  package_names: names, search_terms: [],
  limits: { search_results_per_term: 3, new_packages_per_run: 10, packages_per_run: 20, max_packages: 500, max_requests: 40, ...limits },
});

function fixture(options: { missing?: boolean; projects?: boolean; version?: string; search?: string[] } = {}) {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/-/v1/search?')) {
      return json({ objects: (options.search ?? ['beta']).map(name => ({ package: { name } })) });
    }
    if (url.includes('/latest')) {
      const name = decodeURIComponent(new URL(url).pathname.split('/')[1]);
      return json({ name, version: options.version ?? '1.0.0', description: `Package ${name}` });
    }
    const requests = JSON.parse(String(init?.body)).requests;
    if (url.endsWith('/versionbatch')) {
      return json({ responses: requests.map((request: Json) => ({ request, ...(!options.missing ? { version: {
        versionKey: request.versionKey, licenses: ['MIT'], advisoryKeys: [],
        relatedProjects: options.projects ? [{ projectKey: { id: 'github.com/example/shared' }, relationType: 'SOURCE_REPO', relationProvenance: 'UNVERIFIED_METADATA' }] : [],
      } } : {}) })).reverse() });
    }
    if (url.endsWith('/projectbatch')) {
      return json({ responses: requests.map((request: Json) => ({ request, project: { projectKey: request.projectKey, starsCount: 50 } })) });
    }
    throw new Error(`Unexpected fixture URL: ${url}`);
  };
  return { fetchImpl, calls };
}

test('discovery deduplicates names, encodes scoped packages, and batches shared projects once', async () => {
  const mock = fixture({ projects: true, search: ['@scope/alpha', 'beta', 'beta'] });
  const config = seeds(['@scope/alpha']);
  config.search_terms = ['csv'];
  const result = await collectCatalog({ seeds: config, ...mock, pause });
  assert.deepEqual(result.catalog.packages.map(p => p.name), ['@scope/alpha', 'beta']);
  assert.ok(mock.calls.some(url => url.endsWith('/%40scope%2Falpha/latest')));
  assert.deepEqual(result.counts, { total: 5, npm: 3, deps_dev: 2 });
  assert.equal(result.catalog.packages[0].projects[0].status, 'found');
  const data = result.catalog.packages[0].deps_dev.data as Json;
  assert.equal((data.relatedProjects as Json[])[0].relationProvenance, 'UNVERIFIED_METADATA');
});

test('batch pages match request keys, preserve unknown fields, and represent not-found explicitly', async () => {
  const requests = ['alpha', 'beta', 'gamma'].map(name => ({ versionKey: { system: 'NPM', name, version: '1.0.0' } }));
  const bodies: Json[] = [];
  const client = new PackageSources({ maxRequests: 3, pause, fetchImpl: async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    return bodies.length === 1 ? json({ responses: [
      { request: requests[1], version: { versionKey: requests[1].versionKey, futureField: 'retained' } },
    ], nextPageToken: 'page2' }) : json({ responses: [
      { request: requests[2], version: {} },
      { request: requests[0], version: { versionKey: requests[0].versionKey } },
    ] });
  } });
  const result = await client.versions(requests.map(r => r.versionKey));
  assert.equal(result.get('beta')?.futureField, 'retained');
  assert.equal(result.get('gamma'), null);
  assert.deepEqual(bodies[1].requests, bodies[0].requests);
  assert.equal(bodies[1].pageToken, 'page2');
});

test('large refreshes use batches of at most 25', async () => {
  const sizes: number[] = [];
  const client = new PackageSources({ maxRequests: 3, pause, fetchImpl: async (_url, init) => {
    const { requests } = JSON.parse(String(init?.body));
    sizes.push(requests.length);
    return json({ responses: requests.map((request: Json) => ({ request })) });
  } });
  const result = await client.versions(Array.from({ length: 26 }, (_, i) => ({ name: `package-${i}`, version: '1.0.0' })));
  assert.deepEqual(sizes, [25, 1]);
  assert.equal(result.size, 26);
});

for (const problem of ['missing', 'duplicate', 'mismatch', 'repeated-token'] as const) {
  test(`rejects ${problem} batch responses`, async () => {
    const client = new PackageSources({ maxRequests: 5, pause, fetchImpl: async (_url, init) => {
      const { requests } = JSON.parse(String(init?.body));
      const entry = { request: requests[0], version: { versionKey: requests[0].versionKey } };
      if (problem === 'mismatch') entry.version.versionKey = { ...entry.version.versionKey, version: '9.0.0' };
      return json({ responses: problem === 'missing' || problem === 'repeated-token' ? [] : problem === 'duplicate' ? [entry, entry] : [entry],
        ...(problem === 'repeated-token' ? { nextPageToken: 'repeat' } : {}),
      });
    } });
    const expected = { missing: /Incomplete/, duplicate: /duplicate/, mismatch: /mismatched/, 'repeated-token': /repeated/ };
    await assert.rejects(client.versions([{ name: 'alpha', version: '1.0.0' }]), expected[problem]);
  });
}

test('429 stops immediately, exposes Retry-After, and never retries automatically', async () => {
  let calls = 0;
  const client = new PackageSources({ maxRequests: 40, pause, fetchImpl: async () => {
    calls++;
    return new Response('', { status: 429, headers: { 'Retry-After': '60' } });
  } });
  await assert.rejects(client.latest('alpha'), /429.*Retry-After: 60/);
  assert.equal(calls, 1);
});

test('uses Cloudflare-compatible manual redirects and rejects upstream redirects', async () => {
  let calls = 0;
  const client = new PackageSources({ maxRequests: 2, pause, fetchImpl: async (_url, init) => {
    calls++;
    assert.equal(init?.redirect, 'manual');
    return new Response('', { status: 302, headers: { Location: 'https://other.invalid/' } });
  } });
  await assert.rejects(client.latest('alpha'), /HTTP 302/);
  assert.equal(calls, 1);
});

test('the request cap includes concurrent requests and does not allow an extra fetch', async () => {
  const mock = fixture();
  const client = new PackageSources({ maxRequests: 2, ...mock, pause });
  const results = await Promise.allSettled(['alpha', 'beta', 'gamma'].map(name => client.latest(name)));
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal(mock.calls.length, 2);
  assert.equal(client.counts.total, 2);
});

test('oversized upstream responses fail within the response byte cap', async () => {
  const client = new PackageSources({ maxRequests: 1, pause, fetchImpl: async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)) });
  await assert.rejects(client.latest('alpha'), /byte cap/);
});

test('unknown npm fields and a version not yet indexed by deps.dev stay unknown', async () => {
  const result = await collectCatalog({ seeds: seeds(), ...fixture({ missing: true }), pause });
  const record = result.catalog.packages[0];
  assert.equal(record.npm.browser, null);
  assert.equal(record.npm.engines, null);
  assert.equal(record.npm.dependencies, null);
  assert.equal(record.deps_dev.status, 'not_found');
  assert.equal(record.deps_dev.data, null);
});

test('incremental refresh adds candidates, retains records, and rotates the oldest evidence', async () => {
  const first = await collectCatalog({ seeds: seeds(['alpha', 'beta']), ...fixture(), pause, now: () => '2026-01-01T00:00:00Z' });
  const config = seeds(['alpha', 'beta', 'gamma'], { new_packages_per_run: 1, packages_per_run: 1 });
  const second = await collectCatalog({ seeds: config, previous: first.catalog, ...fixture(), pause, now: () => '2026-02-01T00:00:00Z' });
  assert.equal(second.added, 1);
  assert.equal(second.catalog.packages.length, 3);
  assert.deepEqual(second.catalog.packages[0], first.catalog.packages[0]);
  const mock = fixture({ version: '2.0.0' });
  const third = await collectCatalog({ seeds: config, previous: second.catalog, ...mock, pause, now: () => '2026-03-01T00:00:00Z' });
  assert.equal(third.catalog.packages[0].version, '2.0.0');
  assert.equal(third.catalog.packages[1].version, '1.0.0');
  assert.ok(mock.calls[0].endsWith('/alpha/latest'));
  assert.equal(first.catalog.packages[0].version, '1.0.0');
});

test('an exhausted refresh leaves the caller\'s prior catalog intact', async () => {
  const first = await collectCatalog({ seeds: seeds(), ...fixture(), pause });
  const before = JSON.stringify(first.catalog);
  await assert.rejects(collectCatalog({ seeds: seeds(['alpha'], { max_requests: 1 }), previous: first.catalog, ...fixture(), pause }), /budget exhausted/);
  assert.equal(JSON.stringify(first.catalog), before);
});

test('an unpublished package keeps its old evidence, is marked unavailable, and does not block other refreshes', async () => {
  const first = await collectCatalog({ seeds: seeds(['alpha']), ...fixture(), pause, now: () => '2026-01-01T00:00:00Z' });
  const mock = fixture();
  const fetchImpl: typeof fetch = (input, init) => String(input).endsWith('/alpha/latest') ? Promise.resolve(new Response('', { status: 404 })) : mock.fetchImpl(input, init);
  const result = await collectCatalog({ seeds: seeds(['alpha', 'beta']), previous: first.catalog, fetchImpl, pause, now: () => '2026-02-01T00:00:00Z' });
  assert.equal(result.catalog.packages.length, 2);
  assert.equal(result.catalog.packages[0].npm.registry_status, 'not_found');
  assert.equal(result.catalog.packages[0].npm.fetched_at, '2026-01-01T00:00:00Z');
  assert.equal(result.catalog.packages[0].npm.checked_at, '2026-02-01T00:00:00Z');
  assert.equal(result.catalog.packages[1].npm.registry_status, 'found');
  assert.deepEqual(result.unavailable, ['alpha']);
});

test('snapshot round-trips with a checksum and rejects changed catalog bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'npm-catalog-test-'));
  try {
    const config = seeds();
    const result = await collectCatalog({ seeds: config, ...fixture(), pause });
    await writeCatalog(result, directory, config);
    assert.deepEqual(await readCatalog(join(directory, 'catalog.json')), result.catalog);
    const text = await readFile(join(directory, 'catalog.json'), 'utf8');
    await writeFile(join(directory, 'catalog.json'), text + ' ');
    await assert.rejects(readCatalog(join(directory, 'catalog.json')), /checksum or size/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('rejects unsafe names and over-budget seed configuration before making requests', () => {
  assert.throws(() => seeds(['../private']));
  assert.throws(() => seeds(['alpha'], { max_requests: 201 }));
  assert.throws(() => seeds(['alpha'], { packages_per_run: 1, new_packages_per_run: 2 }));
});
