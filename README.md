# Package Scout

A private ChatGPT plugin and a small hosted MCP for finding existing npm packages before writing custom code. The backend uses npm and **deps.dev v3alpha**, with deterministic filters and scoring. It makes no model calls and requires no upstream API keys.

## Tools

`search_packages` returns up to three candidates. Parameters include:

- `keywords`: short search keywords, combined length 2–64 characters.
- `runtime`: `any`, `browser`, or `node`. Specific runtimes require an explicit declaration in the package's current registry metadata.
- `quality_profile`: `balanced` (default), `established`, or `explore`.
- `licenses_any`, `min_weekly_downloads`, `match_all_keywords`, `package_type`, and explicit deprecated/prerelease overrides.

`get_package_details` inspects `name` and `version` (`latest` or an exact version). Optional `include_readme` and `include_dependency_summary` retrieve additional evidence for a final shortlist. Source URLs and evidence dates are returned.

Example tool arguments:

```json
{
  "keywords": ["transcription"],
  "runtime": "browser",
  "quality_profile": "balanced",
  "limit": 3
}
```

The same functions power `POST /v1/search` and `POST /v1/package`. MCP is at `POST /mcp`; `GET /health` checks service configuration without upstream calls.

## Filtering and scoring

Balanced discovery requires at least 100 weekly downloads, an identified license, and deps.dev version evidence. Established raises the download floor to 10,000. Explore removes the adoption and evidence floors. All profiles exclude known direct advisories and explicitly unlicensed packages. Deprecated and prerelease versions are excluded unless requested.

Registry names, descriptions and keyword lists must overlap the query. A caller may require all keywords. Library searches exclude recognizable workflow plugins, types-only packages and packages declared only as CLIs. Results are limited to one per known source repository.

The 100-point formula is in `src/quality.ts`:

| Signal | Maximum points | Calculation |
| --- | ---: | --- |
| Query relevance | 35 | 25 × matched-keyword fraction, plus up to 10 for candidate position. |
| Adoption | 20 | Logarithmic weekly downloads, capped at one million. |
| Advisory and Scorecard evidence | 20 | 10 for an observed empty direct-advisory list; up to 10 for a dated Scorecard. Scorecard weight halves after 180 days and falls to one quarter after a year. |
| Dependency footprint | 15 | `15 / (1 + log2(direct dependency count + 1))`. Missing data receives no points. |
| Release recency | 10 | 10 within 90 days, 8 within a year, 5 within three years, otherwise 2. Missing dates receive no points. |

Scores are metadata heuristics, not correctness probabilities. Old stable packages remain eligible. Unknown metrics stay unknown. Runtime declarations can come from manifest fields, keywords or explicit descriptions and are returned with their source; they do not establish tested compatibility. Direct advisories exclude dependency advisories.

## Sources, cache and costs

npm provides keyword search, exact manifests, optional README content, and download statistics. deps.dev provides batched version/project facts and optional resolved dependency graphs. A small bundled catalog supplies discovery hints when npm search misses a known package; every selected hint is checked live before return.

Each search inspects at most ten candidates and three catalog hints, with at most sixteen upstream requests. Fetches have a shared deadline, individual timeouts, response byte limits and bounded pagination. No automatic retries, package installs or package code execution occur.

A bounded memory cache keeps successful searches for five minutes and inspections for fifteen minutes within a warm server instance. It stores at most 32 entries of at most 128 KiB each. Cache hits preserve original evidence dates and use no upstream calls. No provider-specific cache service or database is required. Entries contain public-source metadata indexed by hashed parameters. There is no D1, BigQuery, persistent user-query log, or server-side inference bill. Cache persistence across server instances and regions is best effort.

The optional Actions workflow independently builds downloadable catalog snapshots from maintained public seeds. Hosted MCP requests never dispatch an Actions runner. Automatic persistent catalog growth and a public GitHub mirror are separate from this private plugin deployment.

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
