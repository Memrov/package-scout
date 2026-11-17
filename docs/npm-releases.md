# npm releases

The publishable package is isolated in `npm/`. The repository's root remains a
private development project. The tarball contains only `package.json`, the
self-contained MCP server, README and Apache-2.0 license. It has no runtime
dependencies or installation scripts.

## Prepare and inspect

1. Set the package name and version in `npm/package.json`, and update the pinned
   examples in `docs/npm-package.md`.
2. Run `npm run plugin:build` after shared server changes, then
   `npm run npm:build` to copy the checked server, README and license.
3. Run `npm run check`, `npm test`, `npm run build` and `npm run validate`.
4. Inspect `npm pack ./npm --ignore-scripts --dry-run --json`.

`npm test` checks both distributions against their source. Its npm smoke test
packs the tarball, installs it offline in a fresh directory, and invokes the
installed `package-scout` binary through npm exec to negotiate MCP and discover
the two tools.

## Initial publication

The unscoped `package-scout` name belongs to an unrelated publisher. This source
prepares `@memrov2/package-scout`, using the authenticated publisher's personal
scope. A prepared manifest or successful dry run
does not mean the package has been published.

For the first release, an authorized npm owner can supply a narrowly scoped npm
token through the encrypted GitHub Actions secret `NPM_BOOTSTRAP_TOKEN`. Run
`npm-publish.yml` from the tested `main` commit, verify the registry and native
npm provenance, then remove that temporary secret. Its value is exposed only to
the final publication step. Keep credentials out of source and logs.

Alternatively, an npm owner can publish the inspected tarball locally using
`npm publish <tarball> --access public --ignore-scripts`. A local publication
does not produce GitHub Actions provenance; do not claim that it does.

## Subsequent releases through GitHub Actions

Configure npm's trusted publisher for the package with these exact values:

- Provider: GitHub Actions
- Repository owner: `Memrov`
- Repository name: `package-scout`
- Workflow filename: `npm-publish.yml`
- Environment: leave blank
- Allowed action: direct `npm publish`

This must be configured by an npm package owner. After bootstrap, the workflow
uses short-lived OIDC credentials without a stored npm token. Configure the publisher close
to the next release: npm currently expires a new configuration if its first
successful publish does not happen within two days.

Bump the package version, regenerate both distributions as needed, run the
checks, commit and push. Push a matching tag such as `npm-v1.0.1` or manually run
the publish workflow from `main`. The workflow validates the tag against the
package version and publishes with provenance from a GitHub-hosted runner.
The first publication still needs npm account authorization; GitHub access
alone does not authorize a new npm namespace or configure its trusted publisher.

Read back the registry version, publisher and tarball integrity after publishing.
Install that exact version in a clean directory and repeat the MCP smoke check.

Official references: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers)
and [npm provenance](https://docs.npmjs.com/generating-provenance-statements).
