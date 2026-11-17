import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runChallenge } from './run.mjs';
import { TARGET, pack, serialize } from './pack.mjs';
import { validateEvaluation } from '../../scripts/evaluate-package.mjs';

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
const cases = await read('./cases.json');
const recorded = await read('./results.json');
const results = await runChallenge({ cases });
const entrant = (list, id) => list.find(result => result.id === id);

test('the hand-rolled parsers score exactly what the README says they score', () => {
  assert.equal(cases.length, 10);
  assert.deepEqual(entrant(results, 'split').failed.map(failure => failure.id), ['quoted-comma', 'escaped-quote', 'newline-in-field', 'crlf']);
  assert.deepEqual(entrant(results, 'regex').failed.map(failure => failure.id), ['newline-in-field']);
  assert.equal(entrant(results, 'state-machine').passed, 10);
  for (const id of ['split', 'regex', 'state-machine']) assert.deepEqual(entrant(results, id), entrant(recorded.results, id), `${id} matches results.json`);
});

test("the recorded run shows every one of Scout's picks parsing every file", () => {
  for (const id of ['papaparse', 'csv-parse', 'fast-csv']) {
    const record = entrant(recorded.results, id);
    assert.equal(record.passed, 10, id);
    assert.deepEqual(record.failed, [], id);
    assert.match(record.version, /^\d+\.\d+\.\d+$/, id);
  }
});

test("Scout's picks still parse every file when they are installed", { skip: entrant(results, 'papaparse').skipped ? 'run `npm install` in challenges/csv to include the packages' : false }, () => {
  for (const id of ['papaparse', 'csv-parse', 'fast-csv']) assert.deepEqual(entrant(results, id), entrant(recorded.results, id), id);
});

test('the packed evaluation request is current and accepted by the harness', async () => {
  const request = await pack();
  assert.equal(serialize(request), await readFile(TARGET, 'utf8'), 'run `node challenges/csv/pack.mjs` after changing the challenge');
  assert.equal(validateEvaluation(request).run, 'node run.mjs --strict');
  assert.deepEqual(request.input, cases);
});
