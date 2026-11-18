# Design: Scout's own search index

Status: proposal for review, 2026-11-17. Nothing here is built yet beyond the prototype in
[`benchmarks/index-prototype/`](../../benchmarks/index-prototype/).

## Why

Every Scout search starts with npm's live search API. Two measured problems follow from that.

- **It is most of the wait.** A cold search takes about 1.0 s at the median: npm search 0.44 s,
  the ten candidate manifests 0.33 s, and deps.dev 0.15 s.
- **It decides what Scout can find.** Since December 2024, [npm ranks search results on text
  alone](https://socket.dev/blog/npm-updates-search-experience), and its API ignores every sort
  parameter. On the benchmark's dev split, npm's top 100 results contain a right answer for 50 of
  75 queries. For vague requests drawn from awesome-nodejs it is 9 of 18. No ranking change can
  recover a package that never reaches the candidate pool.

## What fast package search does elsewhere

- [Algolia's npm-search](https://github.com/algolia/npm-search), behind yarnpkg.com and
  [jsDelivr](https://www.jsdelivr.com/blog/joining-forces-with-algolia-for-an-even-better-npm-search/),
  keeps its own index of every npm package from the registry's changes feed. Text relevance comes
  first; 30-day downloads break ties; exact names and a "popular" flag are boosted.
- crates.io ranks with PostgreSQL full-text search and, since 2026,
  [scores only the 1,000 matching crates with the most recent downloads](https://blog.rust-lang.org/2026/07/13/crates-io-development-update),
  because ranking every match took 1 to 2 seconds.
- [Orama](https://www.mintlify.com/oramasearch/orama/guides/deployment) runs a prebuilt BM25 index
  inside Cloudflare Workers and keeps it in memory between requests.

The common pattern: own a prebuilt index for retrieval, rank by text relevance with popularity as a
tie-breaker, and keep it fresh separately from queries. Scout's ranking already follows the second
part. This design adds the first.

## Prototype results

The prototype indexes the 17,338 packages in [npm-high-impact](https://github.com/wooorm/npm-high-impact)
(MIT), an independently maintained list of npm's most downloaded and most depended-on packages.
17,124 still resolve. For each it keeps the name, description and keywords from the `/latest`
manifest, and ranks with BM25 over name (weight 3), keywords (2) and description (1), light
stemming, and the list's popularity order as a tie-breaker.

Measured on the benchmark's dev split only:

| Dev queries | Right answer in npm top 100 | In index top 100 | In index top 10 | In either top 100 |
|---|---|---|---|---|
| 28 task queries | 26 | 27 | 24 | 27 |
| 18 awesome-nodejs | 9 | 15 | 9 | 16 |
| 29 awesome-javascript | 15 | 18 | 12 | 20 |
| **All 75** | **50** | **60** | **45** | **63** |

| Measure | Prototype |
|---|---|
| Query latency | 0.2 ms median, under 3 ms worst, against about 440 ms for npm search |
| Build | 0.16 s from a 17K-package corpus |
| Size | 3.4 MB raw, 0.86 MB gzip |
| Corpus fetch | 4.8 minutes at 8 concurrent manifest requests |

The prototype's own first result is weak (9 of 28 tasks). That is expected: the index is meant to
supply candidates, and Scout's existing ranking, with live dependents and verification, chooses
among them.

## Proposal

### 1. What the index holds

One record per package: name, description, keywords, latest version, weekly downloads and, where
known, dependents. Seed it from npm-high-impact plus every package Scout's searches return, so it
grows with real use. Text fields are untrusted and capped, as search records are today.

### 2. How it is built

A scheduled GitHub Action, like the existing catalog workflow:

- Fetch `/latest` for new or changed packages only, at most 8 concurrent requests.
- Fetch downloads with npm's bulk endpoint (up to 128 unscoped packages per request).
- Build the index, verify it against the benchmark's dev split, and publish it as a release asset
  with a checksum and manifest. The action never commits to `main`.

Dependents are the open gap. npm returns them only with search results, and deps.dev counts them
per exact version. Options: carry npm-high-impact's dependents order as an ordinal, or rank
index-only candidates on downloads until npm search confirms them.

### 3. How it reaches users

| Option | Freshness | Cost | Notes |
|---|---|---|---|
| A. Bundle in the plugin | As old as the user's last `/plugin update` | +0.9 MB gzip in the repository | Simplest; no network fetch |
| B. Download into `${CLAUDE_PLUGIN_DATA}` | Daily, cached across sessions | One 0.9 MB fetch per day | Claude Code substitutes `${CLAUDE_PLUGIN_DATA}` in plugin MCP server arguments (observed in 2.1.326; confirm in the plugin reference) |
| C. Hosted Worker only | Daily | Workers KV or the script bundle | Local plugin keeps today's behavior |

Recommendation: **B for the plugin, with A's bundled copy as the offline fallback**, and the same
artifact in KV for the hosted Worker. If the index is missing or fails its checksum, Scout behaves
exactly as today.

### 4. How a search uses it

1. Look up the index (under 3 ms) and start npm search in parallel.
2. Wait for npm search for at most a fixed budget, about 250 ms. Merge whatever has arrived;
   npm's live results still catch packages newer than the index.
3. Rank the merged pool with the existing rules; live npm dependents apply where npm returned them.
4. Verify only the finalists live: manifest, deprecation, advisories and repository signals, as now.

Expected cold latency: about 0.5 s, down from 1.0 s, before caching manifests by version. Those
are immutable, so they can also be cached in `${CLAUDE_PLUGIN_DATA}`.

### 5. Guarantees kept

- The index only proposes candidates. Versions, licenses, deprecation and advisories are always
  fetched live for anything Scout returns.
- No ranking change ships unless it wins on the dev split. The test split is then run once and
  reported, per [the benchmark protocol](../../benchmarks/search/README.md).
- Request budgets, byte caps and deadlines stay as they are.

## Rollout

1. Build pipeline and artifact, with the prototype's retrieval checks as a gate.
2. Hybrid retrieval behind an option. Compare with today on dev for right-at-#1, retrieval and
   latency, then run test once.
3. Ship to the plugin with fallback, then to the hosted Worker.

## Open questions

- **npm terms:** whether redistributing package descriptions in a published index is acceptable
  under npm's terms. Algolia and jsDelivr do it publicly, but this should be checked, not assumed.
- **Seed list:** npm-high-impact has a single maintainer. Scout's own observed results reduce that
  dependency over time.
- **Dependents for index-only candidates** (see section 2).
- **Size budget** for options A and C, and whether the bundled fallback is worth it.
- **Platforms:** macOS and Windows behavior of `${CLAUDE_PLUGIN_DATA}` has not been tested.
