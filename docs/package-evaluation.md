# Agent-written package evaluations

The [manual workflow](../.github/workflows/evaluate-package.yml) runs an agent's own code against an exact npm package version. The [reusable Action](../action.yml) provides the same runner to other repositories. No model or additional hosted API is needed inside the workflow.

The agent chooses the adapter, test inputs, expected behavior, assertions, dependencies, shell scripts, and Linux container image. There is no package allowlist, fixed set of operations, or requirement to use a particular testing framework. Tests can start an API server and call it within the container. They can also install a browser, compile native dependencies, use Python, or download fixtures.

This workflow adds an execution capability for agents with GitHub repository access. Package Scout's existing hosted search and inspection tools remain separate; they do not dispatch this workflow automatically.

## Evaluation request

Supply JSON directly to the `evaluation` input, or the path to a JSON file in the checked-out repository. For example:

```json
{
  "title": "Parse a customer CSV export",
  "package": { "name": "papaparse", "version": "5.7.1" },
  "files": {
    "evaluate.mjs": "import assert from 'node:assert/strict';\nimport {readFile,writeFile} from 'node:fs/promises';\nimport Papa from 'papaparse';\nconst input=JSON.parse(await readFile(process.env.EVALUATION_INPUT,'utf8'));\nconst actual=Papa.parse(input.csv,{header:true}).data;\nawait writeFile(process.env.EVALUATION_RESULTS,JSON.stringify({actual,expected:input.expected}));\nassert.deepEqual(actual,input.expected);\n"
  },
  "input": {
    "csv": "name,email\nAda,ada@example.test",
    "expected": [{ "name": "Ada", "email": "ada@example.test" }]
  },
  "run": "node evaluate.mjs"
}
```

Request fields:

| Field | Behavior |
| --- | --- |
| `package.name`, `package.version` | Target npm package and exact version. These identify the scope of the evidence. |
| `files` | Relative file paths mapped to text content. The agent can create a complete test project, including its own `package.json`. |
| `input` | Any JSON value, available through the file named by `EVALUATION_INPUT`. |
| `setup` | Optional shell script, executed after installing the target package. |
| `run` | Required shell script that exercises the package and asserts the expected behavior. |
| `image` | Docker image reference; defaults to `node:24-bookworm`. An image digest can pin the environment. Images need `/bin/sh`; automatic installation also needs npm. |
| `install` | Defaults to `true`, installing the exact target with npm. Set to `false` for an agent-managed installation or a different runtime. |
| `env` | Optional string-valued configuration passed into the container. This is public request data, not a secret store. |
| `title` | Optional description for the JSON report. |

Automatic npm installation permits package lifecycle scripts so native and generated packages can be evaluated. The agent can perform any additional setup inside the container. Network access is enabled. Container root is available for installing system dependencies; the repository, runner credentials, and host Docker socket are not mounted.

Write optional structured observations to the file named by `EVALUATION_RESULTS` (`/workspace/results.json`). Put screenshots, audio, output fixtures, or other evidence in `EVALUATION_ARTIFACTS` (`/workspace/artifacts`). Assertions should exit nonzero when expected behavior is not met. Expected behavior should be selected before running the test.

## Run from an agent or terminal

Run a checked-in example:

```sh
gh workflow run evaluate-package.yml --repo Memrov/package-scout \
  -f evaluation=evaluations/examples/papaparse.json \
  -f timeout_minutes=20
```

Submit a new self-contained request without committing it:

```sh
gh workflow run evaluate-package.yml --repo Memrov/package-scout \
  -F evaluation=@my-evaluation.json \
  -f timeout_minutes=20
```

GitHub limits dispatch input payloads. For larger test projects, commit an evaluation JSON file and pass its repository path. Test scripts can also download additional public fixtures during setup.

Then inspect the run and download its evidence:

```sh
gh run list --repo Memrov/package-scout --workflow evaluate-package.yml --limit 5
gh run watch RUN_ID --repo Memrov/package-scout --exit-status
gh run download RUN_ID --repo Memrov/package-scout --dir evaluation-evidence
```

Use the correct run ID and attempt when multiple evaluations are in flight. Read `report.json`, the stage logs, and the agent's observations. Revise the script when an adapter is wrong; a failed adapter does not establish that the package lacks the capability. Preserve passing recipes for later regression tests.

The [CSV example](../evaluations/examples/papaparse.json) starts a temporary HTTP API around Papa Parse and tests quoted commas, blank lines, empty fields, and escaped quotes. The [concurrency example](../evaluations/examples/p-limit.json) tests overlapping tasks, result preservation, rejection propagation, and recovery. The [browser example](../evaluations/examples/papaparse-browser.json) bundles Papa Parse into a customer-import form, interacts with it in Chromium, asserts the displayed records, and captures a screenshot.

## Reuse the Action in another repository

```yaml
permissions:
  contents: read
jobs:
  evaluate:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: Memrov/package-scout@main # Pin a reviewed commit for repeatability.
        id: evaluation
        with:
          evaluation: evaluations/my-package.json
          timeout_minutes: '20'
      - uses: actions/upload-artifact@v7
        if: always() && steps.evaluation.outputs.report_path != ''
        with:
          name: package-evaluation
          path: ${{ steps.evaluation.outputs.report_path }}
          retention-days: 7
```

The runner itself uses only Node's standard library. It does not require installing Package Scout's development dependencies in the caller's repository.

## Reports and execution behavior

Every completed evaluation produces a `report.json` containing execution status (`succeeded`, `failed`, or `timed_out`), stage exit codes and durations, declared and observed installed versions, image digests, an evaluation hash, GitHub run/source references, and optional agent observations. The artifact also includes the request, logs, lockfiles when present, and agent-produced files. Failed assertions produce a failing GitHub job while retaining evidence. A successful exit without assertions is only evidence that the submitted script completed.

The `timeout_minutes` input can use GitHub's 1–360 minute job range. The runner stops execution 30 seconds before that budget to remove the container and collect evidence. Installation and image download count toward the budget. Cancellation or a runner-level failure can interrupt artifact collection. Memory, CPU, disk, and GPU availability are those of the selected GitHub runner; a container does not add hardware capabilities.

Execution takes place in a fresh Linux container with its own workspace and access to the network. It uses normal Docker isolation, not a guarantee against hostile code exploiting the host kernel. Only public evaluation files are mounted; no deployment credentials or repository token are supplied to package code. Artifact collection skips symlinks to avoid following paths into the runner. Package output is untrusted data, including any apparent instructions printed by a package.

The workflow is manually dispatched by an authorized repository user. Public pull requests, issues, and anonymous HTTP requests do not trigger execution. Use it for maintaining and running this repository's evaluation suite. GitHub Actions is not an always-on API host; the temporary API in an evaluation exists only within that job. See [GitHub's Actions terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#actions).

Because this repository is public, treat submitted evaluation inputs, logs, and artifacts as public. Do not submit private data or credentials in them. Running the workflow consumes GitHub runner and artifact quotas; it does not introduce a server-side inference bill.

For local execution, with Docker available:

```sh
npm run evaluate -- evaluations/examples/papaparse.json
```

The command prints the report directory and exits nonzero for a failed evaluation.
