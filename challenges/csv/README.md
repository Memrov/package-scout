# The CSV challenge

Parsing CSV looks like ten lines. It is really ten years of bug reports.

This folder holds ten small CSV files. Seven exercise a rule from [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180); three are things real exports do. All ten are legal. A parser passes a file when it returns exactly the right rows.

## Results

| Parser | Lines you own | Files parsed correctly | Gets wrong |
| --- | ---: | ---: | --- |
| The quick way: `split(",")` | 5 | 6 of 10 | quoted-comma, escaped-quote, newline-in-field, crlf |
| The clever way: a regex | 7 | 9 of 10 | newline-in-field |
| The careful way: a state machine | 35 | 10 of 10 | nothing |
| `papaparse` 5.7.1 | 2 | 10 of 10 | nothing |
| `csv-parse` 7.0.3 | 2 | 10 of 10 | nothing |
| `fast-csv` 5.0.8 | 8 | 10 of 10 | nothing |

Recorded on 2026-11-17 with Node 22.23.4. The raw record is [results.json](results.json), and the test suite fails if the hand-rolled scores drift from it.

## What a failure looks like

Neither hand-rolled parser throws. They return wrong rows and carry on.

`split(",")` meets a customer called `"Smith, Jane"`. Her email lands in a column named `undefined`:

```json
{ "name": "\"Smith", "email": " Jane\"", "undefined": "jane@example.test" }
```

The regex meets an address with a line break in it. Two customers go in and three come out:

```json
[{ "name": "Ada,\"1 Main St" }, { "name": "Springfield\"" }, { "name": "Lin", "address": "2 Side St" }]
```

## The ten files

| File | Where it comes from | What it checks |
| --- | --- | --- |
| `plain` | The easy one | A header and two rows. |
| `quoted-comma` | RFC 4180, rule 6 | A field containing a comma is wrapped in quotes. |
| `escaped-quote` | RFC 4180, rule 7 | A quote inside a quoted field is written twice. |
| `newline-in-field` | RFC 4180, rule 6 | A quoted field may contain a line break. |
| `crlf` | RFC 4180, rule 1 | The standard line ending is CRLF. |
| `no-trailing-newline` | RFC 4180, rule 2 | The last record may end without a line break. |
| `empty-fields` | Real exports | Missing values are empty strings, not missing columns. |
| `trailing-blank-line` | Real exports | An extra blank line at the end is not a row. |
| `byte-order-mark` | Real exports | Excel's "CSV UTF-8" starts with an invisible mark that is not part of the first header. |
| `spaces-kept` | RFC 4180, rule 4 | Spaces are part of a field. |

The inputs and expected rows are in [cases.json](cases.json).

## How it was kept honest

- The ten files, their expected rows and each package's settings were written before the first run. Nothing was adjusted afterwards.
- The three packages were not hand-picked. They are what Package Scout ranked first on 2026-11-17 for `csv parser` in the browser (`papaparse`), `csv` on Node (`csv-parse`) and `csv parser` on Node (`fast-csv`).
- Each package runs with one fixed, documented configuration: header row on, blank lines skipped, and for `csv-parse` its `bom` option on. The adapters are in [entrants/](entrants).
- `--strict` exits non-zero unless every one of Scout's picks parses every file. That was the expectation set in advance, and the run met it.

## What this is not

- **It is not a benchmark of any AI model.** A capable agent can write the careful parser. We wrote one, knowing the test files: 35 lines, 10 of 10. The question is what you own afterwards. Streaming, delimiter detection, malformed quotes and encodings are not tested here, and they are all still yours.
- **It is not a conformance suite.** Ten files show where the rabbit hole starts. They do not map it.

## Bring your own parser

Ask your agent for a CSV parser, save what it writes, and run it:

```sh
git clone https://github.com/Memrov/package-scout
cd package-scout
npm run challenge -- ./my-parser.mjs
```

Your file exports `parse(text)` and returns an array of row objects keyed by the header. The hand-rolled entrants need nothing installed. To include the three packages, run `npm install` inside `challenges/csv` first.

## Run it in a clean container

[evaluations/examples/csv-challenge.json](../../evaluations/examples/csv-challenge.json) is this folder packed for [the evaluation harness](../../docs/package-evaluation.md), so the same challenge runs in a disposable container on GitHub Actions:

```sh
gh workflow run evaluate-package.yml --repo Memrov/package-scout \
  -f evaluation=evaluations/examples/csv-challenge.json
```

After changing anything in this folder, run `node challenges/csv/pack.mjs` to repack it. The test suite fails if you forget.
