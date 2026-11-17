# Claude Code Plugin Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task in the current session.

**Goal:** Ship Package Scout as a Claude Code plugin with a two-command marketplace install and `/package-scout:scout`.

**Architecture:** Bundle the small stdio entrypoint and existing Worker handler into `claude-code/server.mjs`, so search, built-ins, inspection and caching retain one implementation. Ship the isolated `claude-code/` plugin directory with no package manifest or lockfile; installations need no build or dependency installation.

**Observed packaging correction:** The initial root-directory release worked, but an actual GitHub install showed Claude Code automatically installing 45 MB of repository development dependencies. Its official loading documentation confirms this cannot be disabled for a root with package.json and a lockfile. The isolated distribution fixes that behavior; `npm test` checks generated-file freshness and runs the real bundled transport.

**Tech Stack:** Node.js 24.3+, native type stripping, Claude Code manifests and skills, Node's test runner.

**Spec:** The conversation handoff and user request: install the official `plugin-dev` helper, bundle the server, provide a two-command install and `/package-scout:scout`.

## Global Constraints

- Preserve the hosted Site and existing ChatGPT plugin identities and behavior.
- Ship no runtime dependencies, credentials, install hooks or local HTTP listener.
- Resolve bundled files from the plugin root, regardless of the consumer's working directory.
- Keep stdout exclusively for newline-delimited MCP JSON-RPC; notifications have no reply.
- Reuse `plugin/skills/package-discovery/SKILL.md` for the detailed discovery guidance.

## Review Focus

- Startup from a cached path containing spaces with no node_modules or development build tools.
- A client waiting for initialization before it closes stdin.
- Notifications interleaved with requests, including an unknown notification method.
- Malformed and oversized input followed by a valid request.
- A client using any of the three negotiated protocol revisions.

### Task 1: Install and inspect plugin-dev

- [x] Install Claude Code and `plugin-dev@claude-plugins-official` in this environment.
- [x] Read plugin-dev's relevant skills and current official manifest, component and marketplace documentation.

### Task 2: Package and test the stdio server

**Files:** `claude-code/.claude-plugin/plugin.json` (including MCP configuration), `.claude-plugin/marketplace.json`, `scripts/mcp-stdio.mjs`, `scripts/build-claude-plugin.mjs`, `claude-code/server.mjs`, `scripts/mcp-stdio.test.mjs`, `package.json`.

**Interfaces:** Consume `worker/index.ts`'s default `fetch(Request): Promise<Response>` handler. Expose the same MCP tools over newline-delimited stdin/stdout, using the declared `${CLAUDE_PLUGIN_ROOT}` launcher path.

- [x] Write subprocess tests for the review focus cases and observe them fail before implementation.
- [x] Add the minimal stdio adapter and manifests.
- [x] Run the new tests, then the full existing suite, type check and Worker build validation.

### Task 3: Document, validate and install the release

**Files:** `claude-code/skills/scout/SKILL.md`, `docs/claude-code-plugin.md`, `README.md`.

- [x] Add a namespaced skill using the shared discovery guidance and exact plugin MCP tool names.
- [x] Document `/plugin marketplace add Memrov/package-scout`, `/plugin install package-scout@package-scout`, prerequisites and development commands.
- [x] Run Claude Code's strict plugin/marketplace validation and inspect the discovered components.
- [ ] Commit and push the verified source, install from GitHub, and verify the installed copy with real MCP calls.
- [ ] Report installed versions and any host/model verification limits.
