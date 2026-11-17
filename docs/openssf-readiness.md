# OpenSSF evidence and remaining requirements

Package Scout uses OpenSSF Scorecard as repository-practice evidence. Its public
results are at [the Scorecard viewer](https://scorecard.dev/viewer/?uri=github.com/Memrov/package-scout).
The score is computed upstream; a workflow file or local passing test is not a
claim that a particular check has already reached 10.

The [2026-11-17 result](openssf-scorecard-2026-11-17.json) is **7.5/10**, up from
4.9 before these controls. Signed-Releases, Packaging, Fuzzing and
Dependency-Update-Tool each score 10. Historical review, CI and analysis coverage,
project age, contributor diversity and the separate Best Practices badge still
limit the total.

## Repository controls

| Area | Implementation or evidence |
| --- | --- |
| CI | `.github/workflows/ci.yml` runs types, tests, distribution freshness and the Worker build. |
| Static analysis | `.github/workflows/codeql.yml` uses the JavaScript/TypeScript security-extended suite on pushes and PRs, excluding generated bundles. |
| Updates | `.github/dependabot.yml` covers repository and CSV challenge npm dependencies plus GitHub Actions. |
| Fuzzing | `worker/input.fuzz.test.ts` uses fast-check for generated argument values, invalid package names, malformed registry rows, phrase direction and MCP envelopes. CI runs 1,000 examples per property; the nightly workflow runs 10,000. |
| Source review | `CONTRIBUTING.md` documents PRs, checks and maintainership. `.github/CODEOWNERS` identifies the actual current maintainer. No AI service integration is installed. |
| Main protection | The [active ruleset](https://github.com/Memrov/package-scout/rules/27439770) enforces `.github/main-ruleset.json`: PRs, current-branch CI and CodeQL, resolved discussions, linear history and protection from deletion/force pushes. No actors bypass it. CodeQL errors and high/critical security alerts block merges. |
| Releases | `.github/workflows/release.yml` packages a tested commit already on `main`, signs SLSA provenance through GitHub OIDC, verifies it, and publishes the package, checksums and signed in-toto bundle. |
| npm | [`@memrov2/package-scout@1.0.1`](https://www.npmjs.com/package/@memrov2/package-scout) was published by [GitHub Actions](https://github.com/Memrov/package-scout/actions/runs/44041423807) with native npm provenance. The temporary encrypted bootstrap secret was removed. Future OIDC publishing requires the npm owner's trusted-publisher configuration. |
| Disclosure | `SECURITY.md` documents private reporting and the boundaries of metadata and execution evidence. |

The fuzz suite found two validation defects during setup: enum arrays such as
`runtime: ["any"]` were accepted through string coercion, and malformed JSON-RPC
IDs were reflected into error responses. The tests were observed failing before
the fixes, and retain minimal examples to prevent those regressions.

The first hosted CodeQL scan also identified a loose hostname comparison and a
checked-path/read-path race. Both alerts are now fixed. Evaluation collection
uses an opened descriptor and skips both collection and recursive scratch
deletion if container removal is unconfirmed; the regression test demonstrated
the unsafe behavior before the fix. The [fix PR](https://github.com/Memrov/package-scout/pull/4)
passed CI and CodeQL with zero findings.

The [1.0.1 GitHub release](https://github.com/Memrov/package-scout/releases/tag/release-v1.0.1)
is immutable and includes SHA-256 checksums and signed SLSA provenance. The npm
tarball is byte-for-byte identical to that signed artifact. A fresh registry
installation passed official MCP SDK checks, and `npm audit signatures` verified
its registry signature and provenance. The [verification report](release-verification-2026-11-17.json)
records the identities, fingerprint and live checks. The [public extended fuzz run](https://github.com/Memrov/package-scout/actions/runs/44042285878)
passed 50,000 generated cases.

## OpenSSF Best Practices badge

The [Best Practices portal](https://www.bestpractices.dev/en/projects/new) requires
a signed-in project owner to add the project. Its self-assessment is distinct
from Scorecard and must be completed against actual practices. This repository
does not claim a passing, silver or gold badge without that assessment.

The license, public source, contribution guide, security policy, test commands,
automated analysis and verified release process provide evidence for the
assessment. Owner commitments, response history, independent human review and
other unverified criteria must remain unanswered or unmet until established.
Gold requires a project with multiple developers; automation cannot manufacture
that condition.

## Limits on reaching 10

- Scorecard's Maintained check requires a project older than 90 days and sustained
  activity. Creating empty commits to fill a calendar does not improve the project.
- The Contributors check requires genuine recent contributions from multiple
  organizations. No identities or organization affiliations are fabricated.
- Main's single-maintainer rules require PRs and automated checks but do not
  require approvals from nonexistent collaborators. Two independent approvals
  and mandatory code-owner review can be enabled after additional maintainers
  agree to review; the current rule does not claim full branch-protection credit.
- Review and CI checks inspect real merged history. Existing direct pushes and
  the original PR cannot be retroactively described as reviewed and tested.

The check definitions are documented by [OpenSSF Scorecard](https://github.com/ossf/scorecard/blob/main/docs/checks.md).
