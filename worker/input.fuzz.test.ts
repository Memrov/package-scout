import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import { argumentsFor } from '../src/discovery.ts';
import { PackageSources } from '../src/package-sources.ts';
import { matchKeywords } from '../src/relevance.ts';
import { createHandler } from './index.ts';

const parameters = {
  numRuns: Number(process.env.SCOUT_FUZZ_RUNS ?? 1000),
  ...(process.env.SCOUT_FUZZ_SEED ? { seed: Number(process.env.SCOUT_FUZZ_SEED) } : {}),
};
const json = fc.jsonValue({ maxDepth: 4 });
const invalidName = fc.oneof(
  fc.string().map(value => `../${value}`),
  fc.string().map(value => `https://${value}`),
  fc.string().map(value => `@scope/${value}/extra`),
  fc.string().map(value => `${value}\0`),
);

test('fuzz: accepted runtime and package-type enums always remain strings', () => {
  fc.assert(fc.property(
    fc.constantFrom('runtime', 'package_type'),
    fc.oneof(json, fc.constantFrom(['any'], ['browser'], ['node'], ['library'])),
    (field, value) => {
      let parsed;
      try { parsed = argumentsFor('search_packages', { keywords: ['csv'], [field]: value }); }
      catch (error) { assert.ok(error instanceof Error); return; }
      assert.equal(typeof parsed[field], 'string');
      const choices = field === 'runtime' ? ['any', 'browser', 'node'] : ['library', 'any'];
      assert.ok(choices.includes(String(parsed[field])));
    },
  ), { ...parameters, examples: [['runtime', ['any']], ['package_type', ['library']]] });
});

test('fuzz: invalid package identities are rejected before an upstream request', async () => {
  await fc.assert(fc.asyncProperty(invalidName, async name => {
    let requests = 0;
    const client = new PackageSources({ maxRequests: 1, fetchImpl: async () => {
      requests++;
      return Response.json({ name, version: '1.0.0' });
    } });
    await assert.rejects(client.latest(name), /Invalid npm package name/);
    assert.equal(requests, 0);
  }), parameters);
});

test('fuzz: malformed registry rows cannot discard valid neighbors or defeat deduplication', async () => {
  const malformedRow = fc.oneof(
    fc.constant(null), fc.boolean(), fc.array(json, { maxLength: 4 }),
    invalidName.map(name => ({ package: { name } })),
    fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)).map(name => ({ package: { name } })),
  );
  await fc.assert(fc.asyncProperty(fc.array(malformedRow, { maxLength: 40 }), async rows => {
    const first = { package: { name: 'scout-kept-first', version: '1.0.0' } };
    const second = { package: { name: 'scout-kept-second', version: '2.0.0' } };
    const client = new PackageSources({ maxRequests: 1, fetchImpl: async () =>
      Response.json({ objects: [first, ...rows, first, second] }) });
    const result = await client.searchCandidates('scout', 100);
    assert.deepEqual(result.map(row => (row.package as { name: string }).name), ['scout-kept-first', 'scout-kept-second']);
    assert.equal(client.skippedSearchRecords, rows.length);
  }), parameters);
});

test('fuzz: phrase matching preserves direction across case and separator changes', () => {
  const word = fc.array(fc.constantFrom(...'abcdefghijklmnopqrtuvwxyz'), { minLength: 2, maxLength: 6 }).map(chars => chars.join(''));
  fc.assert(fc.property(
    fc.uniqueArray(word, { minLength: 2, maxLength: 2 }),
    fc.constantFrom(' ', '-', '_', '/', '.', '\t'),
    ([first, second], separator) => {
      const metadata = { description: `${first.toUpperCase()}${separator}${second.toUpperCase()}` };
      const phrase = `${first} ${second}`;
      assert.deepEqual(matchKeywords(metadata, [phrase]), [phrase]);
      assert.deepEqual(matchKeywords(metadata, [`${second} ${first}`]), []);
    },
  ), parameters);
});

test('fuzz: arbitrary MCP envelopes produce bounded protocol errors without upstream work', async () => {
  let requests = 0;
  const handler = createHandler({ fetchImpl: async () => { requests++; throw new Error('Unexpected upstream request'); } });
  const envelope = fc.oneof(json, fc.record({ jsonrpc: fc.constant('2.0'), id: json, params: json }));
  await fc.assert(fc.asyncProperty(envelope, async input => {
    const body = input && typeof input === 'object' && !Array.isArray(input)
      ? { ...input, method: 'scout/fuzz-unknown' } : input;
    const response = await handler.fetch(new Request('http://scout.test/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    assert.ok([200, 400].includes(response.status));
    const text = await response.text();
    assert.ok(text.length < 17408);
    const reply = JSON.parse(text);
    assert.equal(reply.jsonrpc, '2.0');
    assert.ok([-32700, -32600, -32601].includes(reply.error.code));
    assert.ok(reply.id === null || typeof reply.id === 'string' || typeof reply.id === 'number');
    assert.equal(requests, 0);
  }), { ...parameters, examples: [[{ jsonrpc: '2.0', id: false, params: {} }]] });
});
