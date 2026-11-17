# OpenSSF evidence and remaining requirements

Package Scout uses OpenSSF Scorecard as repository-practice evidence. Its public
results are at [the Scorecard viewer](https://scorecard.dev/viewer/?uri=github.com/Memrov/package-scout).
The score is computed upstream; a workflow file or local passing test is not a
claim that a particular check has already reached 10.

## Repository controls

| Area | Implementation or evidence |
| --- | --- |
| CI | `.github/workflows/ci.yml` runs types, tests, distribution freshness and the Worker build. |
| Static analysis | `.github/workflows/codeql.yml` uses the JavaScript/TypeScript security-extended suite on pushes and PRs, excluding generated bundles. |
| Updates | `.github/dependabot.yml` covers repository and CSV challenge npm dependencies plus GitHub Actions. |
| Fuzzing | `worker/input.fuzz.test.ts` uses fast-check for generated argument values, invalid package names, malformed registry rows, phrase direction and MCP envelopes. CI runs 1,000 examples per property; the nightly workflow runs 10,000. |
| Source review | `CONTRIBUTING.md` documents PRs, checks and maintainership. `.github/CODEOWNERS` identifies the actual current maintainer. No AI service integration is installed. |
| Main protection | `.github/main-ruleset.json` requires PRs, current-branch CI and CodeQL, resolved discussions, linear history and protection from deletion/force pushes. Activation is a separate GitHub administrator operation; the file alone does not enforce rules. |
| Releases | `.github/workflows/release.yml` packages a tested commit already on `main`, signs SLSA provenance through GitHub OIDC, verifies it, and publishes the package, checksums and signed in-toto bundle. |
| npm | `.github/workflows/npm-publish.yml` supports trusted publishing. Initial npm authentication and package-owner configuration remain separate from GitHub access. |
| Disclosure | `SECURITY.md` documents private reporting and the boundaries of metadata and execution evidence. |

The fuzz suite found two validation defects during setup: enum arrays such as
`runtime: ["any"]` were accepted through string coercion, and malformed JSON-RPC
IDs were reflected into error responses. The tests were observed failing before
the fixes, and retain minimal examples to prevent those regressions.

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
