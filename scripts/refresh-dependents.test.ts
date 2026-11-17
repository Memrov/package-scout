import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectDependents, countedReleases, serializeDependents, validateConfig, validateDependents } from './refresh-dependents.ts';

const pause = async () => {};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const config = (overrides = {}) => validateConfig({
  search_terms: ['csv parse'], search_size: 100, min_weekly_downloads: 10000, release_lines: 4, max_packages: 100, concurrency: 3, ...overrides,
});

test('counted releases are the newest of each recent line plus the previous release of the newest line', () => {
  const versions = ['0.1.0', '0.1.5', '0.2.0', '1.0.0', '1.2.0', '2.0.0', '2.1.0', '2.1.1', '3.0.0-beta.1', 'not-a-version'];
  assert.deepEqual(countedReleases(versions, 4), ['0.1.5', '0.2.0', '1.2.0', '2.1.0', '2.1.1']);
  assert.deepEqual(countedReleases(versions, 2), ['1.2.0', '2.1.0', '2.1.1']);
  assert.deepEqual(countedReleases(['4.0.0'], 4), ['4.0.0']);
  assert.deepEqual(countedReleases(['1.0.0-rc.1'], 4), []);
});

function upstream(options: { rateLimitFirstSearch?: boolean; failing?: string[] } = {}) {
  const calls: string[] = [];
  let searches = 0;
  const releases: Record<string, string[]> = { popular: ['1.0.0', '2.0.0', '2.1.0'], newcomer: ['1.0.0'], unindexed: [] };
  const dependents: Record<string, number | null> = { 'popular@1.0.0': 700, 'popular@2.0.0': 40, 'popular@2.1.0': 5, 'newcomer@1.0.0': null };
  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input)); calls.push(url.toString());
    if (url.pathname === '/-/v1/search') {
      if (options.rateLimitFirstSearch && ++searches === 1) return new Response('', { status: 429, headers: { 'Retry-After': '30' } });
      return json({ objects: [
        { package: { name: 'popular' }, downloads: { weekly: 5000000 } },
        { package: { name: 'newcomer' }, downloads: { weekly: 20000 } },
        { package: { name: 'unindexed' }, downloads: { weekly: 15000 } },
        { package: { name: 'small' }, downloads: { weekly: 900 } },
      ] });
    }
    const parts = url.pathname.split('/').map(decodeURIComponent);
    const name = parts[5];
    if (options.failing?.includes(name)) return new Response('', { status: 500 });
    if (parts.length === 6) return name === 'unindexed' ? new Response('', { status: 404 }) : json({ packageKey: { system: 'NPM', name }, versions: releases[name].map(version => ({ versionKey: { system: 'NPM', name, version } })) });
    const version = parts[7].replace(/:dependents$/, '');
    const count = dependents[`${name}@${version}`];
    return count === null || count === undefined ? new Response('', { status: 404 }) : json({ dependentCount: count * 3, directDependentCount: count, indirectDependentCount: count * 2 });
  };
  return { fetchImpl, calls };
}

test('the snapshot sums direct dependents for popular search results and leaves unknowns out', async () => {
  const mock = upstream();
  const result = await collectDependents({ config: config(), ...mock, pause, now: () => '2026-11-17T00:00:00.000Z' });
  assert.deepEqual(result.dependents.packages, { popular: 745 });
  assert.deepEqual(result.uncounted.sort(), ['newcomer', 'unindexed']);
  assert.deepEqual(result.failed, []);
  assert.equal(result.considered, 3, 'packages under the download floor are not counted');
  assert.ok(!mock.calls.some(url => url.includes('/small')));
  assert.deepEqual(validateDependents(JSON.parse(serializeDependents(result.dependents))), result.dependents);
});

test('a rate-limited search backs off and resumes instead of failing the snapshot', async () => {
  const waits: number[] = [];
  const result = await collectDependents({ config: config(), ...upstream({ rateLimitFirstSearch: true }), pause: async ms => { waits.push(ms); } });
  assert.deepEqual(result.dependents.packages, { popular: 745 });
  assert.ok(waits.includes(15000));
});

test('too many failed packages refuse to publish a partial snapshot', async () => {
  const names = Array.from({ length: 10 }, (_, i) => `package-${i}`);
  const fetchImpl: typeof fetch = async input => {
    if (new URL(String(input)).pathname === '/-/v1/search') return json({ objects: names.map(name => ({ package: { name }, downloads: { weekly: 50000 } })) });
    return new Response('', { status: 500 });
  };
  await assert.rejects(collectDependents({ config: config(), fetchImpl, pause }), /10 of 10 packages failed; no snapshot published/);
});

test('configuration and snapshots are validated', async () => {
  assert.throws(() => validateConfig({ search_terms: [], search_size: 100, min_weekly_downloads: 0, release_lines: 4, max_packages: 1, concurrency: 1 }), /search_terms/);
  assert.throws(() => config({ concurrency: 50 }), /concurrency/);
  assert.throws(() => validateDependents({ schema_version: 1, generated_at: 'x', method: 'm', source: 's', license: 'l', packages: {} }), /header/);
  assert.throws(() => validateDependents({ schema_version: 1, generated_at: '2026-11-17T00:00:00Z', method: 'm', source: 's', license: 'l', packages: { 'Bad Name!': 1 } }), /package name/);
  assert.throws(() => validateDependents({ schema_version: 1, generated_at: '2026-11-17T00:00:00Z', method: 'm', source: 's', license: 'l', packages: { alpha: -1 } }), /count/);
});

test('the committed snapshot and its search terms are valid', async () => {
  validateDependents(JSON.parse(await readFile(new URL('../catalog/dependents.json', import.meta.url), 'utf8')));
  validateConfig(JSON.parse(await readFile(new URL('../catalog/dependents-seeds.json', import.meta.url), 'utf8')));
});
