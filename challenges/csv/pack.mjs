#!/usr/bin/env node
// Packs this folder into one self-contained request for Package Scout's evaluation harness,
// so the same challenge runs in a clean container on GitHub Actions.
//
//   node pack.mjs    rewrite evaluations/examples/csv-challenge.json
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const TARGET = path.resolve(here, '../../evaluations/examples/csv-challenge.json');
const FILES = ['package.json', 'run.mjs', 'entrants/split.mjs', 'entrants/regex.mjs', 'entrants/state-machine.mjs', 'entrants/papaparse.mjs', 'entrants/csv-parse.mjs', 'entrants/fast-csv.mjs'];

export async function pack() {
  const read = name => readFile(path.join(here, name), 'utf8');
  const manifest = JSON.parse(await read('package.json'));
  return {
    title: "The CSV challenge: ten legal CSV files against hand-rolled parsers and Scout's picks",
    // The harness installs this package; the manifest below brings the other two picks at exact versions.
    package: { name: 'papaparse', version: manifest.dependencies.papaparse },
    files: Object.fromEntries(await Promise.all(FILES.map(async name => [name, await read(name)]))),
    input: JSON.parse(await read('cases.json')),
    run: 'node run.mjs --strict',
  };
}

export const serialize = request => JSON.stringify(request, null, 2) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeFile(TARGET, serialize(await pack()));
  console.log(`Packed ${path.relative(process.cwd(), TARGET)}`);
}
