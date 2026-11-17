#!/usr/bin/env node
// The CSV challenge: ten small, legal CSV files against any parser.
//
//   node run.mjs                     run the built-in entrants
//   node run.mjs ./my-parser.mjs     add yours: export `parse(text)` returning an array of row objects
//   node run.mjs --strict            exit 1 unless every one of Scout's picks passes every file
//   node run.mjs --out results.json  also save the results as JSON
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ENTRANTS = [
  { id: 'split', label: 'The quick way: `split(",")`', kind: 'hand-rolled' },
  { id: 'regex', label: 'The clever way: a regex', kind: 'hand-rolled' },
  { id: 'state-machine', label: 'The careful way: a state machine', kind: 'hand-rolled' },
  { id: 'papaparse', label: '`papaparse`', kind: 'scout' },
  { id: 'csv-parse', label: '`csv-parse`', kind: 'scout' },
  { id: 'fast-csv', label: '`fast-csv`', kind: 'scout' },
];

// Lines you would own: everything that is not blank and not a comment.
const linesOwned = source => source.split('\n').filter(line => line.trim() && !line.trim().startsWith('//')).length;

async function installedVersion(name) {
  try { return JSON.parse(await readFile(path.join(here, 'node_modules', name, 'package.json'), 'utf8')).version; }
  catch { return null; }
}

export async function score(parse, cases) {
  const failed = [];
  for (const item of cases) {
    try {
      // A JSON round trip compares plain data, whatever object type a parser returns.
      assert.deepStrictEqual(JSON.parse(JSON.stringify(await parse(item.csv))), item.expected);
    } catch (error) {
      failed.push({ id: item.id, reason: error instanceof assert.AssertionError ? 'wrong rows' : `threw: ${String(error.message).slice(0, 120)}` });
    }
  }
  return { passed: cases.length - failed.length, failed };
}

export async function runChallenge({ cases, extra = [] }) {
  const entrants = [
    ...ENTRANTS.map(entrant => ({ ...entrant, file: path.join(here, 'entrants', `${entrant.id}.mjs`) })),
    ...extra.map(file => ({ id: path.basename(file), label: `Yours: \`${path.basename(file)}\``, kind: 'yours', file: path.resolve(file) })),
  ];
  const results = [];
  for (const entrant of entrants) {
    const result = { id: entrant.id, label: entrant.label, kind: entrant.kind, lines: linesOwned(await readFile(entrant.file, 'utf8')) };
    if (entrant.kind === 'scout') result.version = await installedVersion(entrant.id);
    try {
      const module = await import(pathToFileURL(entrant.file).href);
      const parse = module.parse ?? module.default;
      if (typeof parse !== 'function') throw new Error('export a function named `parse`');
      Object.assign(result, await score(parse, cases));
    } catch (error) {
      result.skipped = entrant.kind === 'scout' && error.code === 'ERR_MODULE_NOT_FOUND' ? 'not installed: run `npm install` in this folder' : String(error.message).slice(0, 160);
    }
    results.push(result);
  }
  return results;
}

export function table(results, total) {
  const rows = results.map(result => result.skipped
    ? `| ${result.label} | ${result.lines} | skipped | ${result.skipped} |`
    : `| ${result.label}${result.version ? ` ${result.version}` : ''} | ${result.lines} | ${result.passed} of ${total} | ${result.failed.map(failure => failure.id).join(', ') || 'nothing'} |`);
  return ['| Parser | Lines you own | Files parsed correctly | Gets wrong |', '| --- | ---: | ---: | --- |', ...rows].join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const strict = argv.includes('--strict');
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
  const extra = argv.filter((value, i) => !value.startsWith('--') && argv[i - 1] !== '--out');
  const cases = JSON.parse(await readFile(process.env.EVALUATION_INPUT ?? path.join(here, 'cases.json'), 'utf8'));
  const results = await runChallenge({ cases, extra });
  const markdown = table(results, cases.length);
  console.log(`\nThe CSV challenge: ${cases.length} small, legal CSV files.\n\n${markdown}\n`);
  for (const result of results.filter(entry => entry.kind === 'yours' && !entry.skipped)) {
    console.log(result.passed === cases.length
      ? `${result.id}: ${result.passed} of ${cases.length}. Respect. It is ${result.lines} lines, and they are yours forever.`
      : `${result.id}: ${result.passed} of ${cases.length}. Scout knows a package for that.`);
  }
  const report = { node: process.version, files: cases.map(({ id, rule }) => ({ id, rule })), results };
  for (const target of [out, process.env.EVALUATION_RESULTS].filter(Boolean)) await writeFile(target, JSON.stringify(report, null, 2) + '\n');
  if (process.env.EVALUATION_ARTIFACTS) {
    await mkdir(process.env.EVALUATION_ARTIFACTS, { recursive: true });
    await writeFile(path.join(process.env.EVALUATION_ARTIFACTS, 'results.md'), markdown + '\n');
  }
  // Decided before the first run: every package Scout puts first must parse every file.
  const letDown = results.filter(result => result.kind === 'scout' && (result.skipped || result.passed !== cases.length));
  if (strict && letDown.length) {
    console.error(`Strict mode: ${letDown.map(result => result.id).join(', ')} did not parse every file.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
