# Package Scout for Claude Code

Find it. Check it. Prove it. The plugin bundles Package Scout's server and a
`/package-scout:scout` skill. It can also load the skill automatically when a task
calls for an npm package or a platform built-in.

## Install

Install [Claude Code](https://code.claude.com/docs/en/quickstart) and put
**Node.js 24.3.0 or newer** on your `PATH`. In a Claude Code session, run:

```text
/plugin marketplace add Memrov/package-scout
/plugin install package-scout@package-scout
```

Run `/reload-plugins` or start a new session, then try:

```text
/package-scout:scout parse a CSV upload in the browser
/package-scout:scout left-pad invoice numbers to six digits
/package-scout:scout retry failed HTTP calls with backoff in Node
```

The first command registers this repository as a marketplace; the second
installs its Package Scout plugin. Nothing is published to Anthropic's official
marketplace by these commands.

Package Scout needs no API key, hosted login, `npm install`, build step, or
separate server startup. Claude Code itself still requires its normal account
or API access. npm and deps.dev need to be reachable for live evidence.

## What gets installed

- The `scout` skill, exposed as `/package-scout:scout`, follows the
  [shared discovery guidance](../plugin/skills/package-discovery/SKILL.md).
- The local MCP server appears in `/mcp` as
  `plugin:package-scout:package-scout`. It exposes `search_packages` and
  `get_package_details`.
- A self-contained `server.mjs` runs the same Worker handler as the hosted
  Site. There are no runtime npm dependencies and no listening HTTP port.
  The installable directory has no `package.json` or lockfile, so Claude Code
  does not automatically install the repository's development dependencies.

Searches return a compact verdict by default; `detail: "full"` returns the full
evidence. Prefer a returned platform built-in when its requirements and limits
fit. The skill inspects a final package's README before recommending it and
does not install packages or run their code. Search and inspection do not
execute the separate [evaluation Action](package-evaluation.md).

The Claude Code manifest is [`claude-code/.claude-plugin/plugin.json`](../claude-code/.claude-plugin/plugin.json).
The repository's marketplace points at the isolated `claude-code/` directory.
Its MCP configuration lives inside the plugin manifest so simply opening this
repository does not register an extra project-level MCP server. The shared
guidance is copied into the skill's references by the plugin build.

## Update or remove

```text
/plugin marketplace update package-scout
/plugin update package-scout@package-scout
/reload-plugins
```

Use `/plugin uninstall package-scout@package-scout` to remove the plugin. Claude
Code manages its cache and server process.

## Develop and verify

With Node 24.3+ and the development dependencies installed:

```sh
npm run plugin:build
claude --plugin-dir ./claude-code
claude plugin validate ./claude-code --strict
claude plugin validate . --strict
node --test scripts/mcp-stdio.test.mjs
npm test
npm run check
npm run build && npm run validate
```

`--plugin-dir` loads the distributable for that session without a marketplace
install. Keep the manifest's version current when shipping a plugin update.
Commit the generated `claude-code/server.mjs` and skill reference after source
changes so a GitHub install needs no build step. `npm test` first checks that
both generated files match their source; `npm run plugin:check` runs that check
alone. Build tools are development dependencies of this repository only.

The transport tests start real child processes. They cover startup before EOF,
notifications, split requests, malformed and oversized input, protocol
negotiation, and a cached path containing spaces with no build tools or
`node_modules`. Run the standalone source transport with
`node scripts/mcp-stdio.mjs` (or `npm run --silent mcp`); stdout is protocol only.

If `/mcp` reports a startup error, check `node --version` in the shell that
launched Claude Code. If live lookups fail behind an HTTP proxy, use Node's
supported proxy configuration, such as `NODE_USE_ENV_PROXY=1` on current Node
24, while preserving the configured proxy and CA environment variables.

The plugin follows the official [creation guide](https://code.claude.com/docs/en/plugins/create),
[component reference](https://code.claude.com/docs/en/plugins/components), and
[marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference).
