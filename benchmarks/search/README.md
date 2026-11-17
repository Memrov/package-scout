# Search benchmark

Measures whether Scout's top answer is one that people would actually pick, so ranking
changes are judged on evidence rather than on the examples a change was written for.

```sh
npm run benchmark                        # dev split
npm run benchmark -- --baseline FILE     # list answers that changed against an earlier run
npm run benchmark -- --split test        # held-out split: see the protocol below
npm run benchmark -- --record            # refetch npm and deps.dev and replace the recording
```

## Queries and right answers

- `tasks.json`: 28 task-style queries, such as `retry` + `exponential backoff`, with the
  answers an experienced developer would accept and, where one fits, the built-in. The
  maintainers wrote these before seeing results. They have been examined during development,
  so they are all in the dev split.
- `sources.json`: two curated lists at pinned commits, awesome-nodejs (CC0) and
  awesome-javascript. Each kept category becomes a query, and every package the list
  recommends in that category is a right answer. `curated.mjs` derives the queries at run
  time, so none of the lists' content is stored here, and a fingerprint fails the run if the
  derivation changes. A hash of each category name splits them into dev and test halves.

Every query runs with and without its runtime hint (`node` for awesome-nodejs and the tasks,
`browser` for awesome-javascript).

## Protocol

1. Decide what to compare and how you will choose before running it.
2. Compare on the dev split only. `--baseline` shows exactly which answers changed.
3. Run the test split once for the chosen change, and report it alongside dev.
4. Never tune against test results. If a test result prompts a change, that change needs
   new held-out queries.

The first run records every npm and deps.dev response in `build/benchmark/upstream.json`.
Later runs replay it, so two versions of Scout see identical data. Use `--record` to refresh it.

## Limits

- The curated lists are incomplete and partly dated: a modern pick such as zod or fflate can
  count as a miss when a list names older packages.
- Category names are vaguer than real requests. npm's top 100 results contain a
  recommended package for only about half of them, so curated scores are low and best read
  as comparisons between versions, not as absolute accuracy.
- Results measure Scout's answer, not what an agent finally recommends after reading it.
