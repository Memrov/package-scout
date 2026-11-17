# Package Scout

A private ChatGPT plugin and a small hosted MCP for finding existing npm packages before writing custom code. The backend uses npm and **deps.dev v3alpha**, with deterministic filters and profile-specific ranking. It makes no model calls and requires no upstream API keys.

## Tools

`search_packages` returns up to three candidates. Parameters include:

- `keywords`: short search keywords, combined length 2–64 characters.
- `runtime`: `any`, `browser`, or `node`. Specific runtimes require an explicit declaration in the package's current registry metadata.
- `quality_profile`: `vibe`, `production` (default), or `internal`. Legacy `balanced`, `established`, and `explore` requests remain supported.
- `licenses_any`, `min_weekly_downloads`, `match_all_keywords`, `package_type`, and explicit deprecated/prerelease overrides.

`get_package_details` inspects `name` and `version` (`latest` or an exact version). Optional `include_readme` and `include_dependency_summary` retrieve additional evidence for a final shortlist. Source URLs and evidence dates are returned.

Example tool arguments:

```json
{
  "keywords": ["transcription"],
  "runtime": "browser",
  "quality_profile": "vibe",
  "limit": 3
}
```

The same functions power `POST /v1/search` and `POST /v1/package`. MCP is at `POST /mcp`; `GET /health` checks service configuration without upstream calls.

## Run an agent-written evaluation

The [GitHub workflow](.github/workflows/evaluate-package.yml) and [reusable Action](action.yml) execute an agent's own test project in a disposable Linux container. The agent chooses its scripts, assertions, inputs, setup, and container image. It can wrap a package in a temporary HTTP server or install a browser. Results, logs, versions, lockfiles, and additional evidence are uploaded even when assertions fail. See [the evaluation guide](docs/package-evaluation.md) for request fields, examples, dispatch commands, and how to inspect the evidence.

This workflow is separate from the hosted MCP's search and inspection tools. It does not make a model call or add another hosted service.

## Filtering and scoring

Vibe, production, and internal share the same default filters: at least 100 weekly downloads, an identified license, and deps.dev version evidence. The download floor can be overridden explicitly. All profiles exclude known direct advisories and explicitly unlicensed packages. Deprecated and prerelease versions are excluded unless requested. Legacy balanced uses production ordering; established uses production ordering with a 10,000-download floor; explore uses vibe ordering without adoption, identified-license, or version-evidence floors.

Registry names, descriptions and keyword lists must overlap the query. A caller may require all keywords. Library searches exclude recognizable workflow plugins, types-only packages and packages declared only as CLIs. Results are limited to one per known source repository.

Ranking version 2 is implemented in `src/quality.ts`. It compares evidence in the following order, using each later criterion only to break a tie:

| Profile | Priorities after keyword-match fraction |
| --- | --- |
| `vibe` | Fewer declared runtime dependencies, fewer declared install hooks, upstream OpenSSF score, upstream Maintained check, weekly downloads. |
| `production` | Upstream OpenSSF score, upstream Maintained check, weekly downloads, fewer declared runtime dependencies, fewer declared install hooks. |
| `internal` | Fewer declared install hooks, fewer declared runtime dependencies, upstream OpenSSF score, upstream Maintained check, weekly downloads. |

Observed values sort before unknown values for each criterion. Remaining ties preserve discovery order, then package name. This is an evidence-coverage preference, not an assertion that unmeasured packages are poor quality. The priorities are product policies, not empirically calibrated weights.

OpenSSF scores, checks, dates, and source references retain their upstream values. When several associated source repositories have scores, ranking uses the lowest observed score and reports coverage. Scores are not discounted with age; age is reported separately. See [OpenSSF's scoring methodology](https://github.com/ossf/scorecard#aggregate-score). The LFX Health Score is not computed because maintainer and contributor data needed for that model is unavailable in the current pipeline.

The former 100-point composite is retired: `quality.score` is now `null`, and callers should read `quality.signals`, `quality.priorities`, `quality.scorecard`, and `scoring.version`. Missing signals remain `null`. `integration_effort` and `functional_evaluation` are explicitly not assessed; GitHub evaluation reports remain separate evidence. Dependency counts and declared install hooks are footprint facts, not an integration-effort score, proof of local processing, or a count of required external services. Unlisted implicit native builds are not detected by the hook count.

Old stable packages remain eligible; release age is context and does not affect ordering. Runtime declarations can come from manifest fields, keywords or explicit descriptions and are returned with their source; they do not establish tested compatibility. Direct advisories exclude dependency advisories.

## Sources, cache and costs

npm provides keyword search, exact manifests, optional README content, and download statistics. deps.dev provides batched version/project facts and optional resolved dependency graphs. A small bundled catalog supplies discovery hints when npm search misses a known package; every selected hint is checked live before return.

Each search inspects at most ten candidates and three catalog hints, with at most sixteen upstream requests. Fetches have a shared deadline, individual timeouts, response byte limits and bounded pagination. No automatic retries, package installs or package code execution occur.

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

Application code is Apache-2.0. deps.dev-generated data is CC BY 4.0; aggregated package, documentation and project data retain their upstream terms. Each response includes attribution. See the [deps.dev API reference](https://docs.deps.dev/api/v3alpha/) and [npm registry API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md).
