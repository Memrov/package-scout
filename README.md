<p align="center"><img src="assets/banner.svg" alt="Package Scout. Don't build it. Scout it." width="900"></p>

<p align="center">
  <img src="assets/badge-ai-inside.svg" alt="AI inside: none" height="28">
  <img src="assets/badge-csv-parsers.svg" alt="CSV parsers written: 0" height="28">
  <img src="assets/badge-left-pad.svg" alt="left-pad: survived" height="28">
</p>

# Package Scout

Your AI agent loves writing code. Scout would rather not.

Before your agent hand-rolls a CSV parser, Package Scout checks whether npm, or the platform itself, already has one. It answers with a one-line verdict, an install command and the facts behind both. It makes no model calls and needs no API keys.

## Looks like ten lines. It's ten years of bug reports.

We ran ten small, legal CSV files through three hand-rolled parsers and the package Scout picks.

| What you could do | Lines you own | Files parsed correctly |
| --- | ---: | ---: |
| The quick way: `line.split(",")` | 5 | 6 of 10 |
| The clever way: a regex | 7 | 9 of 10 |
| The careful way: a state machine | 35 | 10 of 10 |
| **Scout's way: `npm install papaparse`** | **2** | **10 of 10** |

Neither failing parser throws an error. The quick one files Jane Smith's email under a column named `undefined`. The clever one turns two customers into three.

The files, the method and the raw results are in [the CSV challenge](challenges/csv), with a [passing public GitHub Actions run](https://github.com/Memrov/package-scout/actions/runs/44022644522). Think your agent's parser does better? `npm run challenge -- ./its-parser.mjs`.

## Meet Scout

Every team has one: the developer who answers "how should we build this?" with "we shouldn't, there's a package for that." Scout is that developer, working for your AI agent. Scout has never written a CSV parser and is not about to start.

Scout is lazy, with standards:

- **A package is for a rabbit hole, never for a few lines.** Ask for left-pad and Scout tells you to install nothing.
- **Every pick is real and checked.** It exists on npm today, has a license, is not deprecated and has no known advisories of its own.
- **No AI inside.** Scout is a lookup. Your agent brings the intelligence; Scout brings the facts.

## Try it in a minute

### Claude Code: install the plugin

With Node 24.3+ on your `PATH`, run these two commands inside Claude Code:

```text
/plugin marketplace add Memrov/package-scout
/plugin install package-scout@package-scout
```

Run `/reload-plugins` or start a new session, then ask:

```text
/package-scout:scout parse a CSV upload in the browser
```

The server is bundled and starts automatically. No API key, hosted login,
`npm install`, or separate server is needed. Claude Code itself uses your normal
Claude account. See [the plugin guide](docs/claude-code-plugin.md) for updates,
troubleshooting and development.

### ChatGPT, Codex, or another MCP client

The maintained [hosted copy](https://package-scout-npm-20261116.dscott2017.chatgpt.site) uses Sites sign-in and is currently restricted to accounts granted access. In ChatGPT or Codex, use the existing Package Scout plugin. To run your own copy without hosted access, follow the setup below.

Run it. You need Node 24.3 or newer.

```sh
git clone https://github.com/Memrov/package-scout
cd package-scout
npm ci --ignore-scripts
npm run dev
```

Open `http://127.0.0.1:8787` and ask Scout something. Then give it to your agent:

```sh
claude mcp add --transport http package-scout http://127.0.0.1:8787/mcp
```

That is Claude Code. Any other MCP client can point at the same `/mcp` address, and a project can share it in `.mcp.json`:

```json
{
  "mcpServers": {
    "package-scout": { "type": "http", "url": "http://127.0.0.1:8787/mcp" }
  }
}
```

For your own hosted copy, put its address in place of `http://127.0.0.1:8787` and configure your client's authentication for that host.

Now ask your agent for something it would normally build from scratch:

- "Let customers upload a CSV of contacts."
- "Render this Markdown as HTML."
- "Retry failed API calls with backoff."
- "Add a date picker to the signup form."
- "Left-pad these invoice numbers to six digits."

No agent handy? The same search is one request:

```sh
curl -s http://127.0.0.1:8787/v1/search -H 'content-type: application/json' \
  -d '{"keywords":["csv parser"],"runtime":"browser"}'
```

## What comes back

A short answer: about 2 KB, where the full evidence is about 17 KB. This is a live answer from 2026-11-17, trimmed to the verdict and the first of its three picks:

```json
{
  "verdict": "Scout's pick: papaparse@5.7.1. 25.5M downloads a week, MIT, no known direct advisories. That's the whole job.",
  "platform": null,
  "packages": [
    {
      "name": "papaparse",
      "version": "5.7.1",
      "install": "npm install papaparse@5.7.1",
      "description": "Fast and powerful CSV parser for the browser that supports web workers and streaming large files. Converts CSV to JSON and JSON to CSV.",
      "weekly_downloads": 25501733,
      "licenses": ["MIT"],
      "dependencies": null,
      "runtime": "declared",
      "match": "complete",
      "published_at": "2026-11-11T16:33:28Z",
      "openssf_scorecard": 4.2,
      "npm_url": "https://www.npmjs.com/package/papaparse",
      "repository": "https://github.com/mholt/papaparse"
    }
  ],
  "returned": 3
}
```

When the platform already does the job, the verdict changes. Trimmed again:

```json
{
  "verdict": "Don't install anything: String.prototype.padStart() is built in. If that is not enough, Scout's pick is pad-left@2.1.0.",
  "platform": {
    "builtin": "String.prototype.padStart()",
    "example": "String(7).padStart(3, '0') // '007'",
    "limits": "It counts UTF-16 code units, so emoji and combining characters throw the width off.",
    "note": "The internet broke over an 11-line version of this in 2016. It has been built in since 2017."
  }
}
```

And when Scout is not sure, it says so. A pick with a small crowd opens with "Closest fit", a partial match opens with "Partial match", and both end with "Read its README before you trust it." Ask for `detail: "full"` to get every signal the answer was built from.

## Find it. Check it. Prove it.

| Step | Tool | What you get |
| --- | --- | --- |
| **Find it** | `search_packages` | A verdict, the built-in answer if there is one, and up to three real packages. |
| **Check it** | `get_package_details` | License, weekly downloads, dependencies, known advisories, release date and the README, each with its source. |
| **Prove it** | [The evaluation Action](docs/package-evaluation.md) | Your agent writes a test. A throwaway container runs it against the exact version. You keep the logs, pass or fail. |

## Scout's bar

Nothing makes the shortlist unless it clears all five.

1. **It exists.** Scout reads the live registry, so there are no invented package names.
2. **It has a license it can name.**
3. **It is not deprecated, and not a prerelease.** Unless you ask for those.
4. **It has no known advisories of its own.**
5. **It gets at least 1,000 downloads a week.** Ask for niche packages and this one goes away. The other four stay.

Advisories in a package's dependencies are not checked, and a metadata match is not a test. Scout says both in every answer.

## Things Scout will tell you not to install

| You were about to install | Scout says | The catch |
| --- | --- | --- |
| a left-pad package | `String.prototype.padStart()` | It counts UTF-16 code units, so emoji throw the width off. |
| a deep-clone helper | `structuredClone()` | It throws on functions, and class instances come back plain. |
| a UUID generator | `crypto.randomUUID()` | Version 4 only. |
| an HTTP client | `fetch()` | No retries or interceptors, and you check `response.ok` yourself. |
| a date picker | `<input type="date">` | It looks different in every browser and cannot do ranges. |
| a modal library | `<dialog>` | Styling and animation are yours. |
| a currency formatter | `Intl.NumberFormat` | Display only. |
| an argument parser | `util.parseArgs()` | No subcommands or generated help. |
| dotenv | `node --env-file` | Plain `KEY=value` files. |
| a test runner | `node:test` | Built for Node code. |
| is-odd | `n % 2 !== 0` | None. Scout isn't angry. Scout is disappointed. |

There are 27 built-ins so far, in [catalog/platform.json](catalog/platform.json), and the test suite runs every Node one to make sure it works. Each entry states its limits, because that is the point where a package becomes the right answer after all. Adding one is a single JSON entry.

## The rabbit-hole list

Jobs that look like ten lines and are not. This is Scout's first pick for each, checked live on 2026-11-17. Run `npm run holes` to check again.

| The job | Scout is asked for | Scout's first pick | Downloads a week |
| --- | --- | --- | ---: |
| Parse a CSV upload | `csv parser`, browser | [`papaparse`](https://www.npmjs.com/package/papaparse) | 25.5M |
| Render Markdown | `markdown parser` | [`marked`](https://www.npmjs.com/package/marked) | 130M |
| Read YAML | `yaml` + `parser` | [`js-yaml`](https://www.npmjs.com/package/js-yaml) | 395M |
| Drag and drop | `drag and drop`, browser | [`@dnd-kit/core`](https://www.npmjs.com/package/@dnd-kit/core) | 43.2M |
| Generate a PDF | `pdf` + `generate` | [`pdfkit`](https://www.npmjs.com/package/pdfkit) | 17.8M |
| Fuzzy search | `fuzzy search` | [`fuzzysort`](https://www.npmjs.com/package/fuzzysort) | 21.2M |
| Retry with backoff | `retry` + `backoff` | [`exponential-backoff`](https://www.npmjs.com/package/exponential-backoff) | 56.6M |
| Highlight code | `syntax highlighting` | [`highlight.js`](https://www.npmjs.com/package/highlight.js) | 53.3M |
| Verify a JWT | `jwt`, node | [`jose`](https://www.npmjs.com/package/jose) | 232M |
| Handle time zones | `timezone` | [`@date-fns/tz`](https://www.npmjs.com/package/@date-fns/tz) | 44M |
| Diff two texts | `text diff` | [`diff`](https://www.npmjs.com/package/diff) | 189M |
| Read and write zip files | `zip` | [`jszip`](https://www.npmjs.com/package/jszip) | 72.4M |
| Read an Excel file | `xlsx` | [`exceljs`](https://www.npmjs.com/package/exceljs) | 28.1M |
| Resize an image | `image` + `resize`, node | [`sharp`](https://www.npmjs.com/package/sharp) | 166M |
| Show a toast | `toast`, browser | [`sonner`](https://www.npmjs.com/package/sonner) | 59.2M |
| Draw a chart | `charts`, browser | [`recharts`](https://www.npmjs.com/package/recharts) | 66.9M |
| Run a WebSocket server | `websocket`, node | [`ws`](https://www.npmjs.com/package/ws) | 409M |
| Cache with eviction | `lru cache` | [`lru-cache`](https://www.npmjs.com/package/lru-cache) | 800M |
| Rate-limit an API | `rate limit`, node | [`express-rate-limit`](https://www.npmjs.com/package/express-rate-limit) | 97.4M |
| Compare versions | `semver` | [`semver`](https://www.npmjs.com/package/semver) | 1.2B |

## What Scout won't do

- **Use AI.** No model calls, no API keys, no inference bill.
- **Install anything.** It returns an install command. Running it is your call.
- **Run package code**, unless you ask it to prove a pick.
- **Call a metadata match a test.** It tells you what it checked and what it did not.
- **Look beyond npm.** Not yet.

## FAQ

**Does Scout use AI?**
No. It looks things up.

**How is that different from asking the model?**
A model remembers packages. Scout checks them: today's version, license, downloads and advisories.

**Will it bloat my node_modules?**
It installs nothing. It returns up to three options, says how many dependencies each one brings, and tells you when the platform already does the job.

**Why only three results?**
You weren't going to read ten.

**Where's the score out of 100?**
We had one. It was made up, so we deleted it. Now you get the facts it was made from.

**Can I trust the pick?**
Trust the facts, then check. When Scout is unsure, the verdict says so. For anything that matters, have your agent prove it.

**What if no package exists?**
Then you get to write code. Scout is sorry for your loss.

**Which agents does it work with?**
Claude Code can install the [bundled plugin](docs/claude-code-plugin.md), which uses MCP over stdio. Other clients can connect over HTTP. Both transports are checked against the official MCP SDK client. ChatGPT uses it through the plugin skill in [plugin/skills](plugin/skills/package-discovery/SKILL.md).

## Works well with ponytail

Package Scout was inspired by [ponytail](https://github.com/DietrichGebert/ponytail), which teaches an agent to write less code. Ponytail's ladder asks whether the code needs to exist, then whether the codebase, the platform or an installed dependency already has it, and only then writes the minimum.

Scout adds one question before that last rung: is this a rabbit hole someone has already mapped? The two share a rule, in ponytail's words: "Never add a dependency for a few lines."

## Go deeper

- [Reference](docs/reference.md): every parameter, how candidates are filtered and ordered, limits, cache and costs.
- [Agent-written evaluations](docs/package-evaluation.md): the Prove it step.
- [The CSV challenge](challenges/csv): the ten files, the entrants and how to bring your own parser.
- [The agent skill](plugin/skills/package-discovery/SKILL.md): how an agent is told to use Scout.

## Development

Use Node 24.3+:

```sh
npm ci --ignore-scripts
npm run check        # types
npm test             # unit tests, including every built-in answer
npm run dev          # http://127.0.0.1:8787
npm run test:live    # real lookups against npm and deps.dev
npm run challenge    # the CSV challenge
npm run holes        # regenerate the rabbit-hole table
npm run build && npm run validate
```

Hosting and plugin publishing notes are in the [reference](docs/reference.md#hosting-and-the-plugin).

## License and data

Application code is Apache-2.0. Evidence comes from npm and deps.dev; deps.dev-generated data is CC BY 4.0, and every response carries attribution.
