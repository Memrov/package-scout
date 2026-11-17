# Package Scout on npm

Don't build it. Scout it. Package Scout is an MCP server that checks whether an
npm package, or the platform itself, already does the job before an agent writes
custom JavaScript or TypeScript. It makes no model calls and requires no API key.

## Connect an agent

Use **Node.js 24.3.0 or newer**. Configure an MCP client with:

```json
{
  "mcpServers": {
    "package-scout": {
      "command": "npx",
      "args": ["--yes", "@memrov/package-scout@1.0.0"]
    }
  }
}
```

For Claude Code:

```sh
claude mcp add --transport stdio package-scout -- npx --yes @memrov/package-scout@1.0.0
```

Or install the [Claude Code plugin](https://github.com/Memrov/package-scout/blob/main/docs/claude-code-plugin.md),
which bundles the same server and adds `/package-scout:scout`.

The `package-scout` command communicates using newline-delimited MCP JSON-RPC
on stdin and stdout. The client starts it; there is no listening network port
or hosted login. It needs access to the public npm and deps.dev APIs.

## Find it. Check it. Prove it.

- `search_packages` returns a concise verdict, a platform built-in when one
  fits, and up to three packages with versions, install commands and evidence.
  Pass `detail: "full"` for the full ranking signals and sources.
- `get_package_details` inspects a package and can retrieve its README. Check
  its documented operation, runtime, setup requirements and limitations before
  recommending it.
- The separate [evaluation Action](https://github.com/Memrov/package-scout/blob/main/docs/package-evaluation.md)
  runs an agent-written test in a disposable container when execution evidence
  is needed.

Search and inspection do not install or execute package code. Metadata matches
do not establish functional correctness, and direct advisory checks do not
cover dependency vulnerabilities. The server itself has no runtime npm
dependencies.

## Source and security

[Source and full documentation](https://github.com/Memrov/package-scout) ·
[OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/Memrov/package-scout) ·
[Security policy](https://github.com/Memrov/package-scout/blob/main/SECURITY.md)

Application code is Apache-2.0. Evidence comes from npm and deps.dev;
deps.dev-generated data is CC BY 4.0, and responses include attribution.
