// Public HTTPS only: this adapter also works in a Worker or another MCP host.
export type Json = Record<string, unknown>;
export const DEPS_API = 'https://api.deps.dev/v3alpha';
export const NPM_API = 'https://registry.npmjs.org';
const RESPONSE_BYTE_LIMIT = 4 * 1024 * 1024;
const BATCH_SIZE = 25;
const MAX_BATCH_PAGES = 5;
// A 429 that asks for a short wait gets one more attempt; a longer wait fails at once.
const MAX_RETRY_AFTER_SECONDS = 2;

export class UpstreamHttpError extends Error {
  readonly status: number;
  constructor(status: number, retryAfter: string | null, retried = false) {
    const retry = status === 429 ? `; Retry-After: ${retryAfter ?? 'unspecified'}` : '';
    super(`Upstream HTTP ${status}${retry}; ${retried ? 'failed again after one retry' : 'not retried'}; no publication`);
    this.status = status;
  }
}

function shortRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const seconds = Number(value);
  return seconds <= MAX_RETRY_AFTER_SECONDS ? seconds : null;
}

// Runs jobs with at most `limit` in flight and keeps each outcome in input order.
export async function settleLimited<T>(jobs: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      const index = next++;
      try { results[index] = { status: 'fulfilled', value: await jobs[index]() }; }
      catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }));
  return results;
}

export function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object');
  return value as Json;
}

export function packageName(value: unknown): string {
  if (typeof value !== 'string' || value.length > 214 ||
      !/^(?:@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+|[A-Za-z0-9][A-Za-z0-9._-]*)$/.test(value) ||
      value.replace(/^@/, '').split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Invalid npm package name');
  }
  return value;
}

function versionKey(value: unknown): string {
  const key = object(value);
  if (key.system !== 'NPM' || typeof key.version !== 'string' || !key.version || key.version.length > 128) {
    throw new Error('Invalid npm version key');
  }
  return JSON.stringify([packageName(key.name), key.version]);
}

function projectKey(value: unknown): string {
  const key = object(value);
  if (typeof key.id !== 'string' || !/^(github\.com|gitlab\.com|bitbucket\.org)\/[^\s?#]+\/[^\s?#]+$/.test(key.id)) {
    throw new Error('Invalid project key');
  }
  return key.id.toLowerCase();
}

export class PackageSources {
  readonly counts = { total: 0, npm: 0, deps_dev: 0 };
  skippedSearchRecords = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly pause: (ms: number) => Promise<void>;
  private readonly maxRequests: number;
  private readonly spacingMs: number;

  // spacingMs paces bulk jobs such as the catalog builders. Interactive searches leave it at 0:
  // they make about a dozen requests, and waiting between them was most of their latency.
  constructor(options: { maxRequests: number; fetchImpl?: typeof fetch; pause?: (ms: number) => Promise<void>; spacingMs?: number }) {
    if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1 || options.maxRequests > 200) {
      throw new Error('Request budget must be between 1 and 200');
    }
    const spacing = options.spacingMs ?? 0;
    if (!Number.isInteger(spacing) || spacing < 0 || spacing > 5000) throw new Error('Request spacing must be between 0 and 5000 ms');
    this.maxRequests = options.maxRequests;
    this.spacingMs = spacing;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pause = options.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }

  private async send(url: string, body?: Json): Promise<Response> {
    // Each attempt, including a retry, counts against the request budget.
    if (this.counts.total >= this.maxRequests) throw new Error('Upstream request budget exhausted; no snapshot published');
    const sequence = this.counts.total++;
    const hostname = new URL(url).hostname;
    this.counts[hostname === 'registry.npmjs.org' || hostname === 'api.npmjs.org' ? 'npm' : 'deps_dev']++;
    if (sequence && this.spacingMs) await this.pause(this.spacingMs);
    return this.fetchImpl(url, {
      method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
    });
  }

  private async request(url: string, body?: Json): Promise<Json> {
    let response = await this.send(url, body);
    if (response.status === 429) {
      const wait = shortRetryAfter(response.headers.get('retry-after'));
      if (wait !== null && this.counts.total < this.maxRequests) {
        await response.body?.cancel();
        await this.pause(Math.max(wait * 1000, 250));
        response = await this.send(url, body);
        if (!response.ok) {
          await response.body?.cancel();
          throw new UpstreamHttpError(response.status, response.headers.get('retry-after'), true);
        }
      }
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new UpstreamHttpError(response.status, response.headers.get('retry-after'));
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty upstream response');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > RESPONSE_BYTE_LIMIT) {
        await reader.cancel();
        throw new Error('Upstream response exceeded the byte cap');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return object(JSON.parse(new TextDecoder().decode(bytes)));
  }

  async search(term: string, size: number): Promise<string[]> {
    return (await this.searchCandidates(term, size)).map(item => packageName(object(item.package).name));
  }

  async searchCandidates(term: string, size: number): Promise<Json[]> {
    if (term.length < 2 || term.length > 128 || !term.trim() || !Number.isInteger(size) || size < 1 || size > 100) {
      throw new Error('Invalid npm search parameters');
    }
    const query = new URLSearchParams({ text: term, size: String(size) });
    const data = await this.request(`${NPM_API}/-/v1/search?${query}`);
    if (!Array.isArray(data.objects) || data.objects.length > size) throw new Error('Invalid npm search response');
    const seen = new Set<string>();
    return data.objects.flatMap(value => {
      let item: Json;
      let name: string;
      try { item = object(value); name = packageName(object(item.package).name); }
      catch { this.skippedSearchRecords++; return []; }
      if (seen.has(name)) return [];
      seen.add(name);
      return [item];
    });
  }

  async latest(name: string): Promise<Json> {
    return this.manifest(name, 'latest');
  }

  async manifest(name: string, version: string): Promise<Json> {
    const data = await this.request(`${NPM_API}/${encodeURIComponent(packageName(name))}/${encodeURIComponent(version)}`);
    if (data.name !== name) throw new Error('npm returned a different package');
    versionKey({ system: 'NPM', name, version: data.version });
    if (version !== 'latest' && data.version !== version) throw new Error('npm returned a different version');
    return data;
  }

  async readme(name: string): Promise<Json> {
    const data = await this.request(`${NPM_API}/${encodeURIComponent(packageName(name))}`);
    if (data.name !== name) throw new Error('npm returned a different package');
    const text = typeof data.readme === 'string' ? data.readme : null;
    return { status: text?.trim() ? 'available' : 'missing', text: text?.slice(0, 12000) ?? null, truncated: text ? text.length > 12000 : false, scope: 'package-level README; may not describe a historical version', source_url: `${NPM_API}/${encodeURIComponent(name)}` };
  }

  async dependencies(name: string, version: string): Promise<Json> {
    return this.request(`${DEPS_API}/systems/npm/packages/${encodeURIComponent(packageName(name))}/versions/${encodeURIComponent(version)}:dependencies`);
  }

  async weeklyDownloads(name: string): Promise<number | null> {
    const data = await this.request(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName(name))}`);
    if (data.package !== name) throw new Error('Download statistics identity mismatch');
    return typeof data.downloads === 'number' && Number.isFinite(data.downloads) && data.downloads >= 0 ? data.downloads : null;
  }

  private async batch(requests: Json[], kind: 'version' | 'project'): Promise<Map<string, Json | null>> {
    const keyField = kind === 'version' ? 'versionKey' : 'projectKey';
    const keyOf = kind === 'version' ? versionKey : projectKey;
    const results = new Map<string, Json | null>();
    for (let offset = 0; offset < requests.length; offset += BATCH_SIZE) {
      const group = requests.slice(offset, offset + BATCH_SIZE);
      const expected = new Set(group.map(request => keyOf(request[keyField])));
      const tokens = new Set<string>();
      let token = '';
      let complete = false;
      for (let page = 0; page < MAX_BATCH_PAGES; page++) {
        const data = await this.request(`${DEPS_API}/${kind}batch`, { requests: group, ...(token ? { pageToken: token } : {}) });
        if (!Array.isArray(data.responses)) throw new Error('Invalid deps.dev batch response');
        for (const value of data.responses) {
          const response = object(value);
          const key = keyOf(object(response.request)[keyField]);
          if (!expected.has(key) || results.has(key)) throw new Error('Unexpected or duplicate deps.dev batch entry');
          const payload = response[kind] == null ? null : object(response[kind]);
          const result = payload && Object.keys(payload).length ? payload : null;
          // The request identifies entries; the service may reorder or paginate them.
          if (result && keyOf(result[keyField]) !== key) throw new Error('deps.dev returned mismatched data');
          results.set(key, result);
        }
        const next = data.nextPageToken;
        if (next == null || next === '') { complete = true; break; }
        if (typeof next !== 'string' || tokens.has(next)) throw new Error('Invalid or repeated batch page token');
        tokens.add(next);
        token = next;
      }
      if (!complete) throw new Error('deps.dev batch page limit reached');
      if ([...expected].some(key => !results.has(key))) throw new Error('Incomplete deps.dev batch response');
    }
    return results;
  }

  async versions(packages: { name: string; version: string }[]): Promise<Map<string, Json | null>> {
    if (new Set(packages.map(item => item.name)).size !== packages.length) throw new Error('Expected one version per package');
    const requests = packages.map(({ name, version }) => ({ versionKey: { system: 'NPM', name, version } }));
    const data = await this.batch(requests, 'version');
    return new Map(packages.map(item => [item.name, data.get(versionKey({ system: 'NPM', ...item })) ?? null]));
  }

  async projects(ids: string[]): Promise<Map<string, Json | null>> {
    return this.batch([...new Set(ids)].map(id => ({ projectKey: { id } })), 'project');
  }
}
