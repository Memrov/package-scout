# Reference

Everything the [README](../README.md) leaves out: every parameter, how candidates are filtered and ordered, what the answers do not tell you, and what a request costs.

Package Scout is a small MCP server. It uses npm and **deps.dev v3alpha**, with deterministic filters and profile-specific ranking. It makes no model calls and requires no upstream API keys.

## Endpoints

| Endpoint | What it does |
| --- | --- |
| `POST /mcp` | MCP over HTTP: `initialize`, `tools/list`, `tools/call`, `ping`, `server/discover`. One JSON-RPC message per request, a JSON reply, no session. |
| `POST /v1/search` | The `search_packages` tool as plain JSON. |
| `POST /v1/package` | The `get_package_details` tool as plain JSON. |
| `GET /` | The homepage, with a live search box. `/?q=csv+parser&runtime=browser` runs that search on load. |
| `GET /health` | Service configuration, without upstream calls. |

The server's own protocol version is `2026-07-28`. `initialize` also accepts `2025-11-25` and `2025-06-18` and echoes whichever of them a client asks for, so clients built on the stable MCP SDKs can connect. Any other request is offered `2026-07-28`.

## Tools

### `search_packages`

Returns a one-line verdict, a built-in platform answer when there is one, and up to three candidates. Only `keywords` is required; normal calls need at most these three parameters:

- `keywords`: operation-specific search concepts, combined length 2–64 characters. Put the main operation/domain first, such as `speech synthesis`, `speech recognition`, or `sms` plus `send`. Multiword phrases preserve direction. Matching is soft by default; partial matches list the unmatched concepts.
- `runtime`: `any`, `browser`, or `node`. Prefer matching declarations, including web-framework peers. Explicit incompatibilities are excluded; missing declarations remain eligible with support marked unknown.
- `niche`: `false` by default uses 1,000+ weekly downloads; `true` includes smaller packages while retaining the other filters.

`detail` chooses how much comes back: `compact` (the default) or `full`. It changes presentation only. Both are produced from the same lookup and share one cache entry.

Optional `quality_profile` selects `vibe`, `production` (default), or `internal`. Legacy `balanced`, `established`, and `explore` requests remain supported. Advanced license, download, keyword, package-type, deprecated and prerelease overrides remain available for existing clients.

Example tool arguments:

```json
{
  "keywords": ["speech recognition"],
  "runtime": "browser",
  "niche": false
}
```

### `get_package_details`

Inspects `name` and `version` (`latest` or an exact version). Optional `include_readme` and `include_dependency_summary` retrieve additional evidence for a final shortlist. Source URLs and evidence dates are returned. This tool always returns its full evidence.

## The short answer

With `detail: "compact"`, a search returns:

| Field | Meaning |
| --- | --- |
| `verdict` | One line: the pick and the facts behind it, or the built-in to use instead, or an admission that nothing cleared the bar. |
| `platform` | The built-in that already does the job, or `null`. See [Built-in answers](#built-in-answers). |
| `packages` | Up to three candidates. Each has `name`, `version`, `install`, `description`, `weekly_downloads`, `licenses`, `dependencies`, `runtime`, `match`, `published_at`, `openssf_scorecard`, `npm_url` and `repository`. |
| `packages[].unmatched_keywords` | Present only on a partial match. |
| `packages[].cautions` | Present only when there is something to watch: a partial match, no declared support for the requested runtime, a supporting-role hint, install scripts, under 10,000 weekly downloads, or ten or more direct dependencies. |
| `next_search` | Ready-to-use arguments for a niche retry, when a normal search returned fewer than requested. |
| `warnings`, `meta`, `attribution`, `evidence_limits` | The same values as the full answer. |

`dependencies` is the count of declared direct runtime dependencies. It is `null` when the registry manifest has no `dependencies` field, which npm also does for packages that have none.

The verdict is written from the same facts and changes its tone with them:

- **A complete match with 10,000+ weekly downloads** opens with "Scout's pick", states downloads, license, dependency count when known, and advisories, and ends with one line of Scout's own.
- **A complete match with a small crowd** opens with "Closest fit" and tells you to read the README first.
- **A partial match** names the concepts the metadata does and does not mention.
- **A built-in** opens with "Don't install anything".
- **No candidates** says so, and points at `next_search` when a niche retry is available.

A live three-package answer is about 2.2 KB compact and about 17 KB full.

## The full answer

`detail: "full"` returns everything the search observed: each candidate's manifest fields, `relevance_evidence`, `runtime_evidence`, `role_evidence`, repositories, sources, provenance and `quality` signals, plus `filtered_counts`, `search`, `ordering`, `scoring`, `constraints`, and the same `verdict` and `platform` as the compact answer. A `next_search` in a full answer carries `detail: "full"`.

## Built-in answers

A package is for a rabbit hole, never for a few lines. When a search asks for something the platform already does, the answer says so before it lists any package.

The built-ins live in [catalog/platform.json](../catalog/platform.json). Each entry lists the phrases that mean that job, the runtimes it applies to, an example, what it needs, and its limits: the point where a package becomes the right answer after all.

Matching is deliberately strict. The whole request must be one listed concept, give or take filler words such as `javascript` or `utility` and the entry's own optional words. `uuid` and `uuid` + `generate` match `crypto.randomUUID()`; `uuid` + `validate` does not, because the built-in cannot validate. Word order does not matter, simple plurals are folded, and an entry is skipped when the requested runtime is not one of its own. The npm search still runs, so the shortlist is there if the built-in's limits rule it out.

To add one, add an entry and run the tests. Every entry that claims to work on Node needs a `verify` expression, and the test suite executes it; browser markup is exempt because it cannot run there.

## Filtering and scoring

Vibe, production, and internal share the same default filters: at least 1,000 weekly downloads, an identified license, and deps.dev version evidence. `niche: true` removes the adoption floor; an explicit `min_weekly_downloads` takes precedence over both niche and profile defaults. All profiles exclude known direct advisories and explicitly unlicensed packages. Deprecated and prerelease versions are excluded unless requested. Legacy balanced uses production ordering; established uses production ordering with a 10,000-download floor; explore uses vibe ordering without adoption, identified-license, or version-evidence floors.

Registry names, descriptions and publisher keyword lists must match at least one concept by default. Set `match_all_keywords: true` when every supplied concept must appear in that metadata. Complete matches rank before partial matches; `relevance_evidence` lists matched/unmatched concepts and the match type. These are retrieval signals, not verified capabilities. Publisher `keywords` are returned as discovery hints, not a controlled category taxonomy. Library searches exclude recognizable workflow plugins, types-only packages and packages declared only as CLIs. Results are limited to one per known source repository.

Search starts with ordinary npm text retrieval. If fewer than three records survive inexpensive keyword, adoption, package-type and runtime screening, it makes one additional tagged query for the first concept, deduplicates candidates, and applies the original filters. It does not intersect all concept tags or silently lower the adoption floor. If the alternate query fails, original candidates remain available with a warning. `search.fallback_used`, `search.fallback_status` and `search.keyword_policy` report those choices. When a non-niche request returns fewer than requested, `next_search` contains ready-to-use niche arguments with explicit constraints preserved.

Existing uppercase names and scoped names beginning with a dot or underscore can be inspected without rewriting their identity. Malformed or unsupported search rows are skipped individually and counted in `filtered_counts.unsupported_search_record`; one row cannot abort the whole search. A legacy manifest that declares `engines` as an array is read as having no Node declaration. Other exclusion counts describe this bounded pool, not all packages in npm.

Ranking version 3 is implemented in `src/quality.ts`. All profiles first compare keyword coverage, matched-concept specificity, package-role hints, matches in names/descriptions, runtime evidence, and weekly-download orders of magnitude. Specificity uses smoothed inverse document frequency within the retrieved pool: a rarer task concept wins a partial-match tie over a generic category word. This is text-retrieval evidence, not a functional-fit or quality score. Profile preferences then break ties:

| Profile | Priorities after the shared discovery criteria |
| --- | --- |
| `vibe` | Fewer declared runtime dependencies, fewer declared install hooks, direct dependents, weekly downloads, upstream OpenSSF score, upstream Maintained check. |
| `production` | Direct dependents, weekly downloads, upstream OpenSSF score, upstream Maintained check, fewer declared runtime dependencies, fewer declared install hooks. |
| `internal` | Fewer declared install hooks, fewer declared runtime dependencies, direct dependents, weekly downloads, upstream OpenSSF score, upstream Maintained check. |

Direct dependents come before weekly downloads because downloads also count installs pulled in by other packages: `json-schema` has about three times the weekly downloads of `joi`, mostly as a dependency of other packages, while far more packages choose `joi` directly. The count is the number of packages that depend directly on the package, from deps.dev, summed over the newest release of each of its four most recent release lines plus the previous release of the newest line. deps.dev counts dependents per exact version, and a just-published release shows almost none, so a single version would penalize actively maintained packages. The counts ship in [catalog/dependents.json](../catalog/dependents.json), a snapshot of popular packages found by the searches in [catalog/dependents-seeds.json](../catalog/dependents-seeds.json); a weekly workflow rebuilds it for review. Search results report the count as `direct_dependents`, or null for a package outside the snapshot. Observed values sort before unknown values for each criterion. Remaining ties preserve discovery order, then package name. This is an evidence-coverage preference, not an assertion that unmeasured packages are poor quality. The priorities are product policies, not empirically calibrated weights.

Role hints put unrequested adapters, error formatters, calculators, testing utilities, stores, specialized forks and framework support modules behind primary-library candidates. A caller explicitly requesting that role is not penalized. These are conservative text heuristics and remain visible in `role_evidence`; they do not prove that a package is a complete solution. `runtime_evidence` distinguishes declared, unknown and explicitly incompatible support.

Use operation-specific keywords and add a framework only when required. `speech synthesis` preserves a different operation from `speech recognition`; disconnected `speech` and `text` terms do not convey that distinction. A phrase must appear in that order in the metadata, so when a phrase such as `yaml parser` misses the obvious package, send the concepts separately (`yaml` plus `parser`). Try one alternative operation term if the shortlist misses the task. Inspect a final choice with `get_package_details(include_readme=true)` for its actual operation, runtime/framework requirements, API keys, external services and limitations. Return fewer recommendations when appropriate. Tags alone may describe related functionality rather than the operation you need. [npm's search documentation](https://docs.npmjs.com/searching-for-and-choosing-packages-to-download/) describes its metadata/README retrieval; our metadata checks are narrower.

OpenSSF is optional supporting evidence: a missing or low score never excludes a package. In version 3.3.0, Scorecard and its Maintained check break ties after observed weekly downloads, so merely having a score cannot displace an otherwise tied package with stronger adoption. Scores, checks, dates, and source references retain their upstream values. Search returns compact scores and dates; `get_package_details` retains full check summaries. When several associated source repositories have scores, ranking uses the lowest observed score and reports coverage. Scores are not discounted with age. See [OpenSSF's methodology](https://github.com/ossf/scorecard#aggregate-score). The LFX Health Score is not computed.

The former 100-point composite is retired: `quality.score` is now `null`, and callers should read `quality.signals`, `quality.priorities`, `quality.scorecard`, and `scoring.version`. Missing signals remain `null`. `integration_effort` and `functional_evaluation` are explicitly not assessed; GitHub evaluation reports remain separate evidence. Dependency counts and declared install hooks are footprint facts, not an integration-effort score, proof of local processing, or a count of required external services. Unlisted implicit native builds are not detected by the hook count.

Old stable packages remain eligible; release age is context and does not affect ordering. Runtime declarations can come from manifest fields, framework peers, keywords or explicit descriptions and are returned with their source; they do not establish tested compatibility. Direct advisories exclude dependency advisories. An empty registry README is explicitly marked missing and produces a warning.

## Sources, cache and costs

npm provides keyword search, exact manifests, optional README content, and download statistics. deps.dev provides batched version/project facts and optional resolved dependency graphs. A small bundled catalog supplies discovery hints when npm search misses a known package; every selected hint is checked live before return. Built-in answers come from the bundled platform catalog and need no upstream request.

Each search retrieves up to 100 cheap npm search records per query and up to three catalog hints, selects at most ten for current-manifest inspection, and makes at most sixteen upstream requests. A fallback reserves its request allowance by reducing supplemental hints to two. `candidates_considered` and `candidates_inspected` report those different stages. Fetches have a shared deadline, individual timeouts, response byte limits and bounded pagination. Independent lookups run concurrently, at most five at a time, with no fixed delay between them. A rate-limit response that asks for a wait of two seconds or less is retried once, and the retry counts against the request budget; any other failed request is not retried. Search never installs packages or executes package code.

A bounded memory cache keeps successful searches for five minutes and inspections for fifteen minutes within a warm server instance. It stores at most 32 entries of at most 128 KiB each. It always holds the full evidence, so a compact answer and a full answer to the same search share an entry. Cache hits preserve original evidence dates and use no upstream calls. No provider-specific cache service or database is required. Entries contain public-source metadata indexed by hashed parameters. There is no D1, BigQuery, persistent user-query log, or server-side inference bill. Cache persistence across server instances and regions is best effort.

The homepage search box calls `POST /v1/search`, so a visitor's search costs the same as any other.

The optional Actions workflows independently build downloadable catalog and dependents snapshots from maintained public seeds. They pace their requests, unlike interactive searches, because they make hundreds. Hosted MCP requests never dispatch an Actions runner. Automatic persistent catalog growth is separate from this private plugin deployment. Application source and evaluation workflows are maintained in [Memrov/package-scout](https://github.com/Memrov/package-scout).

## Evaluations

The [GitHub workflow](../.github/workflows/evaluate-package.yml) and [reusable Action](../action.yml) execute an agent's own test project in a disposable Linux container. The agent chooses its scripts, assertions, inputs, setup, and container image. Results, logs, versions, lockfiles, and additional evidence are uploaded even when assertions fail. See [the evaluation guide](package-evaluation.md) for request fields, examples, dispatch commands, and how to inspect the evidence.

This workflow is separate from the hosted MCP's search and inspection tools. It does not make a model call or add another hosted service.

## Hosting and the plugin

The build bundles TypeScript into `dist/server/index.js` and copies `.openai/hosting.json`. Sites manages hosting, authentication, the private plugin connection, and source versions. Preserve this project's `project_id` when updating it.

The plugin's discovery guidance is maintained in [plugin/skills/package-discovery/SKILL.md](../plugin/skills/package-discovery/SKILL.md). Publish MCP schema/instruction changes through the existing Site to refresh its connected plugin; overlay that skill into the existing App-backed plugin while retaining its current App configuration and audience.

## License and attribution

Application code is Apache-2.0. deps.dev-generated data is CC BY 4.0; aggregated package, documentation and project data retain their upstream terms. Each response includes attribution. See the [deps.dev API reference](https://docs.deps.dev/api/v3alpha/) and [npm registry API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md).
