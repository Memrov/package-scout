# Package Scout

A private ChatGPT plugin and a small hosted MCP for finding existing npm packages before writing custom code. The backend uses npm and **deps.dev v3alpha**, with deterministic filters and profile-specific ranking. It makes no model calls and requires no upstream API keys.

## Tools

`search_packages` returns up to three candidates. Only `keywords` is required; normal calls need at most these three parameters:

- `keywords`: operation-specific search concepts, combined length 2–64 characters. Put the main operation/domain first, such as `speech synthesis`, `speech recognition`, or `sms` plus `send`. Multiword phrases preserve direction. Matching is soft by default; partial matches list the unmatched concepts.
- `runtime`: `any`, `browser`, or `node`. Prefer matching declarations, including web-framework peers. Explicit incompatibilities are excluded; missing declarations remain eligible with support marked unknown.
- `niche`: `false` by default uses 1,000+ weekly downloads; `true` includes smaller packages while retaining the other filters.

Optional `quality_profile` selects `vibe`, `production` (default), or `internal`. Legacy `balanced`, `established`, and `explore` requests remain supported. Advanced license, download, keyword, package-type, deprecated and prerelease overrides remain available for existing clients.

`get_package_details` inspects `name` and `version` (`latest` or an exact version). Optional `include_readme` and `include_dependency_summary` retrieve additional evidence for a final shortlist. Source URLs and evidence dates are returned.

Example tool arguments:

```json
{
  "keywords": ["speech recognition"],
  "runtime": "browser",
  "niche": false
}
```

The same functions power `POST /v1/search` and `POST /v1/package`. MCP is at `POST /mcp`; `GET /health` checks service configuration without upstream calls.

## Run an agent-written evaluation

The [GitHub workflow](.github/workflows/evaluate-package.yml) and [reusable Action](action.yml) execute an agent's own test project in a disposable Linux container. The agent chooses its scripts, assertions, inputs, setup, and container image. It can wrap a package in a temporary HTTP server or install a browser. Results, logs, versions, lockfiles, and additional evidence are uploaded even when assertions fail. See [the evaluation guide](docs/package-evaluation.md) for request fields, examples, dispatch commands, and how to inspect the evidence.

This workflow is separate from the hosted MCP's search and inspection tools. It does not make a model call or add another hosted service.

## Filtering and scoring

Vibe, production, and internal share the same default filters: at least 1,000 weekly downloads, an identified license, and deps.dev version evidence. `niche: true` removes the adoption floor; an explicit `min_weekly_downloads` takes precedence over both niche and profile defaults. All profiles exclude known direct advisories and explicitly unlicensed packages. Deprecated and prerelease versions are excluded unless requested. Legacy balanced uses production ordering; established uses production ordering with a 10,000-download floor; explore uses vibe ordering without adoption, identified-license, or version-evidence floors.

Registry names, descriptions and publisher keyword lists must match at least one concept by default. Set `match_all_keywords: true` when every supplied concept must appear in that metadata. Complete matches rank before partial matches; `relevance_evidence` lists matched/unmatched concepts and the match type. These are retrieval signals, not verified capabilities. Publisher `keywords` are returned as discovery hints, not a controlled category taxonomy. Library searches exclude recognizable workflow plugins, types-only packages and packages declared only as CLIs. Results are limited to one per known source repository.

Search starts with ordinary npm text retrieval. If fewer than three records survive inexpensive keyword, adoption, package-type and runtime screening, it makes one additional tagged query for the first concept, deduplicates candidates, and applies the original filters. It does not intersect all concept tags or silently lower the adoption floor. If the alternate query fails, original candidates remain available with a warning. `search.fallback_used`, `search.fallback_status` and `search.keyword_policy` report those choices. When a non-niche request returns fewer than requested, `next_search` contains ready-to-use niche arguments with explicit constraints preserved.

Existing uppercase names and scoped names beginning with a dot or underscore can be inspected without rewriting their identity. Malformed or unsupported search rows are skipped individually and counted in `filtered_counts.unsupported_search_record`; one row cannot abort the whole search. Other exclusion counts describe this bounded pool, not all packages in npm.

Ranking version 3 is implemented in `src/quality.ts`. All profiles first compare keyword coverage, package-role hints, matches in names/descriptions, runtime evidence, and weekly-download orders of magnitude. Profile preferences then break ties:

| Profile | Priorities after the shared discovery criteria |
| --- | --- |
| `vibe` | Fewer declared runtime dependencies, fewer declared install hooks, weekly downloads, upstream OpenSSF score, upstream Maintained check. |
| `production` | Weekly downloads, upstream OpenSSF score, upstream Maintained check, fewer declared runtime dependencies, fewer declared install hooks. |
| `internal` | Fewer declared install hooks, fewer declared runtime dependencies, weekly downloads, upstream OpenSSF score, upstream Maintained check. |

Observed values sort before unknown values for each criterion. Remaining ties preserve discovery order, then package name. This is an evidence-coverage preference, not an assertion that unmeasured packages are poor quality. The priorities are product policies, not empirically calibrated weights.

Role hints put unrequested adapters, error formatters, calculators, testing utilities, stores, specialized forks and framework support modules behind primary-library candidates. A caller explicitly requesting that role is not penalized. These are conservative text heuristics and remain visible in `role_evidence`; they do not prove that a package is a complete solution. `runtime_evidence` distinguishes declared, unknown and explicitly incompatible support.

Use operation-specific keywords and add a framework only when required. `speech synthesis` preserves a different operation from `speech recognition`; disconnected `speech` and `text` terms do not convey that distinction. Try one alternative operation term if the shortlist misses the task. Inspect a final choice with `get_package_details(include_readme=true)` for its actual operation, runtime/framework requirements, API keys, external services and limitations. Return fewer recommendations when appropriate. Tags alone may describe related functionality rather than the operation you need. [npm's search documentation](https://docs.npmjs.com/searching-for-and-choosing-packages-to-download/) describes its metadata/README retrieval; our metadata checks are narrower.

OpenSSF is optional supporting evidence: a missing or low score never excludes a package. In version 3.2.0, Scorecard and its Maintained check break ties after observed weekly downloads, so merely having a score cannot displace an otherwise tied package with stronger adoption. Scores, checks, dates, and source references retain their upstream values. Search returns compact scores and dates; `get_package_details` retains full check summaries. When several associated source repositories have scores, ranking uses the lowest observed score and reports coverage. Scores are not discounted with age. See [OpenSSF's methodology](https://github.com/ossf/scorecard#aggregate-score). The LFX Health Score is not computed.

The former 100-point composite is retired: `quality.score` is now `null`, and callers should read `quality.signals`, `quality.priorities`, `quality.scorecard`, and `scoring.version`. Missing signals remain `null`. `integration_effort` and `functional_evaluation` are explicitly not assessed; GitHub evaluation reports remain separate evidence. Dependency counts and declared install hooks are footprint facts, not an integration-effort score, proof of local processing, or a count of required external services. Unlisted implicit native builds are not detected by the hook count.

Old stable packages remain eligible; release age is context and does not affect ordering. Runtime declarations can come from manifest fields, framework peers, keywords or explicit descriptions and are returned with their source; they do not establish tested compatibility. Direct advisories exclude dependency advisories. An empty registry README is explicitly marked missing and produces a warning.

## Sources, cache and costs

npm provides keyword search, exact manifests, optional README content, and download statistics. deps.dev provides batched version/project facts and optional resolved dependency graphs. A small bundled catalog supplies discovery hints when npm search misses a known package; every selected hint is checked live before return.

Each search retrieves up to 100 cheap npm search records per query and up to three catalog hints, selects at most ten for current-manifest inspection, and makes at most sixteen upstream requests. A fallback reserves its request allowance by reducing supplemental hints to two. `candidates_considered` and `candidates_inspected` report those different stages. Fetches have a shared deadline, individual timeouts, response byte limits and bounded pagination. There are no automatic retries of failed requests, package installs or package code execution.

A bounded memory cache keeps successful searches for five minutes and inspections for fifteen minutes within a warm server instance. It stores at most 32 entries of at most 128 KiB each. Cache hits preserve original evidence dates and use no upstream calls. No provider-specific cache service or database is required. Entries contain public-source metadata indexed by hashed parameters. There is no D1, BigQuery, persistent user-query log, or server-side inference bill. Cache persistence across server instances and regions is best effort.

The optional Actions workflow independently builds downloadable catalog snapshots from maintained public seeds. Hosted MCP requests never dispatch an Actions runner. Automatic persistent catalog growth is separate from this private plugin deployment. Application source and evaluation workflows are maintained in [Memrov/package-scout](https://github.com/Memrov/package-scout).

## Development

Use Node 24.3+:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run dev
npm run test:live
npm run build
npm run validate
```

The preview serves `http://127.0.0.1:8787`. The build bundles TypeScript into `dist/server/index.js` and copies `.openai/hosting.json`. Sites manages hosting, authentication, the private plugin connection, and source versions. Preserve this project's `project_id` when updating it.

The plugin's discovery guidance is maintained in [plugin/skills/package-discovery/SKILL.md](plugin/skills/package-discovery/SKILL.md). Publish MCP schema/instruction changes through the existing Site to refresh its connected plugin; overlay that skill into the existing App-backed plugin while retaining its current App configuration and audience.

Application code is Apache-2.0. deps.dev-generated data is CC BY 4.0; aggregated package, documentation and project data retain their upstream terms. Each response includes attribution. See the [deps.dev API reference](https://docs.deps.dev/api/v3alpha/) and [npm registry API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md).
