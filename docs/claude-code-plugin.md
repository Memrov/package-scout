# Package Scout for Claude Code

Find it. Check it. Prove it. The plugin bundles Package Scout's server and a
`/package-scout:scout` skill. It can also load the skill automatically when a task
calls for an npm package or a platform built-in.

## Install

Install [Claude Code](https://code.claude.com/docs/en/quickstart) and put
**Node.js 22 or newer** on your `PATH`. In a Claude Code session, run:

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
guidance is inlined into the skill by the plugin build, so Claude does not spend a
step opening a separate file.

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
Edit the skill in `scripts/scout-skill.template.md` and the shared guidance in
`plugin/skills/package-discovery/SKILL.md`; the build writes `skills/scout/SKILL.md`.
Commit the generated `claude-code/server.mjs` and `skills/scout/SKILL.md` after source
changes so a GitHub install needs no build step. `npm test` first checks that
both generated files match their source; `npm run plugin:check` runs that check
alone. Build tools are development dependencies of this repository only.

The transport tests start real child processes. They cover startup before EOF,
notifications, split requests, malformed and oversized input, protocol
negotiation, and a cached path containing spaces with no build tools or
`node_modules`. Run the standalone source transport with
`node scripts/mcp-stdio.mjs` (or `npm run --silent mcp`); stdout is protocol only.

If `/mcp` reports a startup error, check `node --version` in the shell that
launched Claude Code. The bundled server needs Node 22 or newer; on an older
Node it exits and names the version and path it found. Running the TypeScript
source directly still needs Node 24.3+. If live lookups fail behind an HTTP
proxy, use Node's supported proxy configuration, such as `NODE_USE_ENV_PROXY=1`
(experimental on Node 22), while preserving the configured proxy and CA
environment variables.

The plugin follows the official [creation guide](https://code.claude.com/docs/en/plugins/create),
[component reference](https://code.claude.com/docs/en/plugins/components), and
[marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference).

The [2026-11-17 verification record](claude-code-plugin-verification-2026-11-17.json)
preserves the tested source commit, installed versions and live SDK results.
Claude Code's native connection check passed. No Claude model account was
signed in there, so conversational use was not tested.

The [session verification record](claude-code-plugin-session-verification-2026-11-17.json)
covers signed-in, headless Claude Code sessions on Node 22 and 24. In those
sessions, `/package-scout:scout` and a plain-language request that loaded the
skill on its own both called the bundled tools and returned sourced answers.
It also records the Node 22 startup failure that plugin 1.0.4 fixes. Interactive
sessions, macOS, Windows and earlier Node 22 releases were not exercised.
