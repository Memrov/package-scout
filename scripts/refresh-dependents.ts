import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPS_API, NPM_API, PackageSources, UpstreamHttpError, object, packageName, settleLimited } from '../src/package-sources.ts';

// deps.dev counts dependents per exact version, and dependents resolve to the newest release
// in the line their range allows. A package's adoption is therefore spread over its release
// lines, and a just-published release shows almost none. Scout sums the lines instead.
export const METHOD = 'Sum of deps.dev v3alpha directDependentCount over the highest release of each of the package\'s most recent release lines, plus the previous release of the newest line. A release line is a major version, or a minor version below 1.0.0. Packages that depend on several of these releases can be counted more than once.';

export type DependentsConfig = {
  search_terms: string[]; search_size: number; min_weekly_downloads: number;
  release_lines: number; max_packages: number; concurrency: number;
};
export type Dependents = {
  schema_version: 1; generated_at: string; method: string; source: string; license: string;
  packages: Record<string, number>;
};

export function validateConfig(value: unknown): DependentsConfig {
  const input = object(value);
  const terms = input.search_terms;
  if (!Array.isArray(terms) || !terms.length || terms.length > 300 || terms.some(v => typeof v !== 'string' || v.length < 2 || v.length > 64 || !v.trim())) {
    throw new Error('Invalid search_terms');
  }
  const limits: Record<string, [number, number]> = {
    search_size: [1, 100], min_weekly_downloads: [0, 1e9], release_lines: [1, 8], max_packages: [1, 20000], concurrency: [1, 8],
  };
  for (const [key, [minimum, maximum]] of Object.entries(limits)) {
    if (!Number.isInteger(input[key]) || (input[key] as number) < minimum || (input[key] as number) > maximum) throw new Error(`Invalid ${key}`);
  }
  return { ...(input as DependentsConfig), search_terms: [...new Set(terms as string[])] };
}

export function validateDependents(value: unknown): Dependents {
  const input = object(value);
  if (input.schema_version !== 1 || typeof input.generated_at !== 'string' || !Number.isFinite(Date.parse(input.generated_at)) ||
      typeof input.method !== 'string' || typeof input.source !== 'string' || typeof input.license !== 'string') {
    throw new Error('Invalid dependents snapshot header');
  }
  const packages = object(input.packages);
  for (const [name, count] of Object.entries(packages)) {
    packageName(name);
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) throw new Error(`Invalid dependent count for ${name}`);
  }
  return input as Dependents;
}

function compareReleases(a: string, b: string): number {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

// The releases whose dependents are summed: the highest of each recent line, plus the
// previous release of the newest line, where dependents linger after a new publish.
export function countedReleases(versions: string[], lines: number): string[] {
  const groups = new Map<string, string[]>();
  for (const version of new Set(versions)) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    const [major, minor] = version.split('.');
    const line = major === '0' ? `0.${minor}` : major;
    groups.set(line, [...(groups.get(line) ?? []), version]);
  }
  const ordered = [...groups.values()].map(group => group.sort(compareReleases))
    .sort((a, b) => compareReleases(a.at(-1)!, b.at(-1)!)).slice(-lines);
  if (!ordered.length) return [];
  const newest = ordered.at(-1)!;
  return [...ordered.map(group => group.at(-1)!), ...(newest.length > 1 ? [newest.at(-2)!] : [])].sort(compareReleases);
}

export async function collectDependents(options: {
  config: DependentsConfig; fetchImpl?: typeof fetch; pause?: (ms: number) => Promise<void>; now?: () => string;
  progress?: (message: string) => void;
}): Promise<{ dependents: Dependents; searched: number; considered: number; uncounted: string[]; failed: string[]; requests: number }> {
  const config = validateConfig(options.config);
  // npm's search endpoint rate-limits even steady traffic. This is a batch job, so it searches
  // one term every two seconds and, when told to slow down, waits 15, 30 and then 60 seconds.
  const pause = options.pause ?? (ms => new Promise<void>(done => setTimeout(done, ms)));
  const weekly = new Map<string, number>();
  let requests = 0;
  for (const [index, term] of config.search_terms.entries()) {
    if (index) await pause(2000);
    let found: Awaited<ReturnType<PackageSources['searchCandidates']>> = [];
    for (let attempt = 0; ; attempt++) {
      const searchClient = new PackageSources({ maxRequests: 2, fetchImpl: options.fetchImpl, pause });
      try { found = await searchClient.searchCandidates(term, config.search_size); break; }
      catch (error) {
        if (!(error instanceof UpstreamHttpError && error.status === 429) || attempt === 3) throw error;
        options.progress?.(`npm asked to slow down at term ${index + 1}; waiting ${15 * 2 ** attempt} s`);
        await pause(15000 * 2 ** attempt);
      } finally { requests += searchClient.counts.total; }
    }
    if ((index + 1) % 25 === 0) options.progress?.(`searched ${index + 1} of ${config.search_terms.length} terms`);
    for (const candidate of found) {
      const name = packageName(object(candidate.package).name);
      const downloads = candidate.downloads && typeof candidate.downloads === 'object' ? object(candidate.downloads).weekly : null;
      if (typeof downloads === 'number' && downloads >= config.min_weekly_downloads) weekly.set(name, Math.max(weekly.get(name) ?? 0, downloads));
    }
  }
  const names = [...weekly].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, config.max_packages).map(([name]) => name);
  options.progress?.(`counting dependents for ${names.length} packages`);
  const outcomes = await settleLimited(names.map(name => async () => {
    const client = new PackageSources({ maxRequests: config.release_lines + 3, fetchImpl: options.fetchImpl, pause });
    try {
      const releases = countedReleases(await client.releaseVersions(name), config.release_lines);
      const counts = await Promise.all(releases.map(version => client.directDependents(name, version)));
      const known = counts.filter((count): count is number => count !== null);
      return known.length ? known.reduce((sum, count) => sum + count, 0) : null;
    } catch (error) {
      // npm lists it but deps.dev does not know it yet: no evidence, which is not a failure.
      if (error instanceof UpstreamHttpError && error.status === 404) return null;
      throw error;
    } finally { requests += client.counts.total; }
  }), config.concurrency);
  const packages: Record<string, number> = {};
  const uncounted: string[] = [];
  const failed: string[] = [];
  outcomes.forEach((outcome, index) => {
    const name = names[index];
    if (outcome.status === 'rejected') failed.push(name);
    else if (outcome.value === null) uncounted.push(name);
    else packages[name] = outcome.value;
  });
  // A partial snapshot would quietly demote the packages it is missing, so refuse to publish one.
  if (failed.length > Math.max(5, names.length * 0.02)) throw new Error(`${failed.length} of ${names.length} packages failed; no snapshot published`);
  const generated_at = (options.now ?? (() => new Date().toISOString()))();
  const dependents = validateDependents({
    schema_version: 1, generated_at, method: METHOD,
    source: `${DEPS_API}/systems/npm/packages/{name}/versions/{version}:dependents`,
    license: 'Generated from deps.dev data under CC-BY-4.0; upstream data retains its applicable terms.',
    packages: Object.fromEntries(Object.entries(packages).sort(([a], [b]) => a.localeCompare(b, 'en'))),
  });
  return { dependents, searched: config.search_terms.length, considered: names.length, uncounted, failed, requests };
}

// One package per line keeps refreshes reviewable as ordinary diffs.
export function serializeDependents(dependents: Dependents): string {
  const { packages, ...header } = dependents;
  const entries = Object.entries(packages).map(([name, count]) => `    ${JSON.stringify(name)}: ${count}`);
  const head = JSON.stringify(header, null, 2).slice(0, -2);
  return `${head},\n  "packages": {\n${entries.join(',\n')}\n  }\n}\n`;
}

async function main(): Promise<void> {
  const config = validateConfig(JSON.parse(await readFile(process.env.DEPENDENTS_CONFIG ?? new URL('../catalog/dependents-seeds.json', import.meta.url), 'utf8')));
  const output = process.env.DEPENDENTS_OUTPUT ?? fileURLToPath(new URL('../build/dependents/dependents.json', import.meta.url));
  const result = await collectDependents({ config, progress: message => console.error(message) });
  const text = serializeDependents(result.dependents);
  validateDependents(JSON.parse(text));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output + '.tmp', text);
  await rename(output + '.tmp', output);
  const summary = {
    generated_at: result.dependents.generated_at, packages: Object.keys(result.dependents.packages).length,
    searched_terms: result.searched, considered: result.considered, uncounted: result.uncounted.length, failed: result.failed,
    upstream_requests: result.requests, sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text),
    sources: { npm: NPM_API, deps_dev: DEPS_API },
  };
  await writeFile(resolve(dirname(output), 'dependents-manifest.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

