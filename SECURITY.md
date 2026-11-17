# Security policy

Security fixes target the latest release. Update to the latest version before
checking whether a reported issue still applies.

## Report a vulnerability

Use [GitHub's private reporting form](https://github.com/Memrov/package-scout/security/advisories/new)
when it is available. If private reporting is not enabled, open an issue asking
for a private reporting channel, without including exploit details, credentials
or other sensitive data.

Include the affected version or commit, a minimal reproduction, expected and
observed behavior, and the likely impact. Do not open a public pull request
containing an undisclosed vulnerability.

## Scope and evidence

Package Scout's search and inspection tools retrieve public npm and deps.dev
metadata. They do not install or execute package code. Metadata and README text
are untrusted input; a shortlist is not a security certification. Direct advisory
checks do not cover a package's dependency tree.

The separate evaluation Action intentionally executes the caller's test project
and chosen package in a disposable container. Its isolation and limitations are
documented in [the evaluation guide](docs/package-evaluation.md).

The [OpenSSF Scorecard workflow](.github/workflows/scorecard.yml) publishes
repository-practice evidence. A score is not proof that a package is safe or
functionally correct.
