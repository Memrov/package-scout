# Contributing

Open a pull request for changes to source, workflows or release configuration.
Explain the behavior being changed and include the checks that establish it.
The Test and build and CodeQL checks must pass before a merge. Keep the branch
up to date with `main` and resolve review conversations.

The current code owner is `@Memrov`. Independent maintainer review is encouraged;
additional code owners should be people who have agreed to take that role.
Automated checks do not constitute independent human approval. The proposed
single-maintainer ruleset requires a PR and CI, with no fabricated reviewer
accounts or mandatory approvals from unavailable collaborators.

## Local checks

Use Node 24.3+:

```sh
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix challenges/csv
npm run check
npm test
npm run build && npm run validate
```

Use `npm run test:fuzz` for the generated-input tests. They make no upstream
requests. A failure reports its random seed and shrink path. Replay a seed with
`SCOUT_FUZZ_SEED=<number> npm run test:fuzz`; increase coverage with
`SCOUT_FUZZ_RUNS=10000 npm run test:fuzz`. The normal suite runs 1,000 examples
per property, and a nightly workflow runs 10,000.

After changing shared source, run `npm run plugin:build` and
`npm run npm:build`, commit the generated files, and bump the Claude plugin
version when its behavior changes. The npm version changes when a published
package is updated. `npm test` rejects stale distributions and smoke-tests the
actual installable tarball.

## Releases

Follow [the npm release guide](docs/npm-releases.md). A `release-v<version>` tag
on a commit already contained in `main` builds the checked package and creates
a GitHub release with SHA-256 checksums and signed SLSA provenance. The workflow
verifies the attestation before publishing the release assets.

Check the release bundle locally with a recent GitHub CLI:

```sh
gh attestation verify <package.tgz> --repo Memrov/package-scout --bundle package-scout.intoto.jsonl
```

The provenance file is the complete Sigstore bundle, encoded as one JSON line.
Its signed payload is an in-toto statement with the SLSA v1 predicate; signing
material is retained for verification. A GitHub release does not imply that npm
registry publication has completed.
