import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPS_API, NPM_API, PackageSources, UpstreamHttpError, object, packageName, type Json } from '../src/package-sources.ts';

type Limits = {
  search_results_per_term: number; new_packages_per_run: number;
  packages_per_run: number; max_packages: number; max_requests: number;
};
type Seeds = { search_terms: string[]; package_names: string[]; limits: Limits };
export type CatalogRecord = {
  name: string; version: string; npm: Json; deps_dev: Json; projects: Json[];
};
export type Catalog = { schema_version: 1; packages: CatalogRecord[] };

export function validateSeeds(value: unknown): Seeds {
  const input = object(value);
  const terms = input.search_terms;
  const names = input.package_names;
  if (!Array.isArray(terms) || terms.length > 10 || terms.some(v => typeof v !== 'string' || v.length < 2 || v.length > 64 || !v.trim())) {
    throw new Error('Invalid search_terms');
  }
  if (!Array.isArray(names) || names.length > 500) throw new Error('Invalid package_names');
  const package_names = [...new Set(names.map(packageName))];
  if (!terms.length && !package_names.length) throw new Error('At least one public discovery seed is required');
  const limits = object(input.limits);
  const maximums: Limits = { search_results_per_term: 10, new_packages_per_run: 50, packages_per_run: 100, max_packages: 500, max_requests: 200 };
  for (const [key, maximum] of Object.entries(maximums)) {
    if (!Number.isInteger(limits[key]) || (limits[key] as number) < 1 || (limits[key] as number) > maximum) throw new Error(`Invalid limit: ${key}`);
  }
  if ((limits.new_packages_per_run as number) > (limits.packages_per_run as number)) throw new Error('New-package budget exceeds package budget');
  return { search_terms: [...new Set(terms as string[])], package_names, limits: limits as Limits };
}

export function validateCatalog(value: unknown): Catalog {
  const input = object(value);
  if (input.schema_version !== 1 || !Array.isArray(input.packages) || input.packages.length > 500) throw new Error('Invalid prior catalog');
  const names = new Set<string>();
  for (const value of input.packages) {
    const record = object(value);
    const name = packageName(record.name);
    const npm = object(record.npm);
    const deps = object(record.deps_dev);
    if (names.has(name) || typeof record.version !== 'string' || !record.version ||
        npm.name !== name || npm.version !== record.version ||
        typeof npm.fetched_at !== 'string' || !Number.isFinite(Date.parse(npm.fetched_at)) ||
        !['found', 'not_found'].includes(String(deps.status)) || !Array.isArray(record.projects)) {
      throw new Error('Invalid or duplicate prior catalog record');
    }
    names.add(name);
  }
  return input as Catalog;
}

function sourceProjectIds(version: Json | null): string[] {
  if (!version?.relatedProjects) return [];
  if (!Array.isArray(version.relatedProjects)) throw new Error('Invalid repository associations');
  return [...new Set(version.relatedProjects.flatMap(value => {
    const relation = object(value);
    if (relation.relationType !== 'SOURCE_REPO') return [];
    const id = object(relation.projectKey).id;
    if (typeof id !== 'string') throw new Error('Missing associated project ID');
    return [id.toLowerCase()];
  }))].slice(0, 2);
}

export async function collectCatalog(options: {
  seeds: Seeds; previous?: Catalog; skipSearch?: boolean;
  fetchImpl?: typeof fetch; pause?: (ms: number) => Promise<void>;
  now?: () => string;
}): Promise<{ catalog: Catalog; counts: PackageSources['counts']; refreshed: number; added: number; unavailable: string[]; generated_at: string }> {
  const seeds = validateSeeds(options.seeds);
  const previous = validateCatalog(options.previous ?? { schema_version: 1, packages: [] });
  if (previous.packages.length > seeds.limits.max_packages) throw new Error('Prior catalog exceeds configured package cap');
  // A bulk job, so it keeps the polite spacing between requests that interactive searches no longer need.
  const client = new PackageSources({ maxRequests: seeds.limits.max_requests, fetchImpl: options.fetchImpl, pause: options.pause, spacingMs: 250 });
  const records = new Map(previous.packages.map(record => [record.name, record]));
  const candidates = new Set(seeds.package_names);
  if (!options.skipSearch) {
    for (const term of seeds.search_terms) {
      for (const name of await client.search(term, seeds.limits.search_results_per_term)) candidates.add(name);
    }
  }
  const added = [...candidates].filter(name => !records.has(name)).slice(0, Math.min(
    seeds.limits.new_packages_per_run, seeds.limits.max_packages - records.size,
  ));
  // Reserve the rest of the run for existing records, oldest fetch first.
  const existing = [...records.values()].sort((a, b) => Date.parse(String(a.npm.checked_at ?? a.npm.fetched_at)) - Date.parse(String(b.npm.checked_at ?? b.npm.fetched_at)) || a.name.localeCompare(b.name));
  const selected = [...added, ...existing.slice(0, seeds.limits.packages_per_run - added.length).map(record => record.name)];
  const manifests: Json[] = [];
  const unavailable: string[] = [];
  for (const name of selected) {
    try { manifests.push(await client.latest(name)); }
    catch (error) {
      if (!(error instanceof UpstreamHttpError) || error.status !== 404) throw error;
      unavailable.push(name);
    }
  }
  const versions = await client.versions(manifests.map(m => ({ name: m.name as string, version: m.version as string })));
  const idsByName = new Map([...versions].map(([name, version]) => [name, sourceProjectIds(version)]));
  const projects = await client.projects([...new Set([...idsByName.values()].flat())]);
  const generated_at = (options.now ?? (() => new Date().toISOString()))();
  if (!Number.isFinite(Date.parse(generated_at))) throw new Error('Invalid build timestamp');
  for (const name of unavailable) {
    const old = records.get(name);
    if (old) records.set(name, { ...old, npm: { ...old.npm, registry_status: 'not_found', checked_at: generated_at } });
  }
  for (const manifest of manifests) {
    const name = manifest.name as string;
    const version = manifest.version as string;
    const fields = [
      'name', 'version', 'description', 'keywords', 'license', 'deprecated',
      'dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta',
      'engines', 'browser', 'type', 'main', 'module', 'types', 'typings', 'exports',
      'os', 'cpu', 'repository', 'homepage', 'sideEffects',
    ];
    records.set(name, {
      name, version,
      npm: { ...Object.fromEntries(fields.map(field => [field, manifest[field] ?? null])), registry_status: 'found', source_url: `${NPM_API}/${encodeURIComponent(name)}/latest`, fetched_at: generated_at, checked_at: generated_at },
      deps_dev: {
        status: versions.get(name) ? 'found' : 'not_found', data: versions.get(name), fetched_at: generated_at,
        source_url: `${DEPS_API}/systems/npm/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`,
      },
      projects: (idsByName.get(name) ?? []).map(id => ({
        requested_id: id, status: projects.get(id) ? 'found' : 'not_found', data: projects.get(id),
        fetched_at: generated_at, source_url: `${DEPS_API}/projects/${encodeURIComponent(id)}`,
      })),
    });
  }
  if (!records.size) throw new Error('Empty catalog; no snapshot published');
  return {
    catalog: validateCatalog({ schema_version: 1, packages: [...records.values()].sort((a, b) => a.name.localeCompare(b.name, 'en')) }),
    counts: client.counts, refreshed: selected.length, added: added.filter(name => records.has(name)).length, unavailable, generated_at,
  };
}

export async function writeCatalog(result: Awaited<ReturnType<typeof collectCatalog>>, directory: string, seeds: Seeds): Promise<void> {
  const catalog = JSON.stringify(result.catalog, null, 2) + '\n';
  const manifest = {
    schema_version: 1, generated_at: result.generated_at, records: result.catalog.packages.length,
    refreshed: result.refreshed, added: result.added, unavailable_packages: result.unavailable, upstream_requests: result.counts,
    sources: { deps_dev: DEPS_API, npm: NPM_API }, limits: seeds.limits,
    version_selection: 'npm latest dist-tag at fetch time; retained records keep their own fetch timestamps',
    seed_sha256: createHash('sha256').update(JSON.stringify(seeds)).digest('hex'),
    files: { 'catalog.json': { sha256: createHash('sha256').update(catalog).digest('hex'), bytes: Buffer.byteLength(catalog) } },
    attribution: {
      provider: 'deps.dev / Open Source Insights', provider_url: 'https://deps.dev',
      api_documentation: 'https://docs.deps.dev/api/v3alpha/', generated_data_license: 'CC-BY-4.0',
      upstream_data_terms: 'Upstream package metadata and project data retain their applicable terms.',
    },
  };
  await mkdir(directory, { recursive: true });
  for (const [name, value] of [['catalog.json', catalog], ['manifest.json', JSON.stringify(manifest, null, 2) + '\n']]) {
    await writeFile(resolve(directory, name + '.tmp'), value);
    await rename(resolve(directory, name + '.tmp'), resolve(directory, name));
  }
}

export async function readCatalog(file: string): Promise<Catalog> {
  const text = await readFile(file, 'utf8');
  const manifest = object(JSON.parse(await readFile(resolve(dirname(file), 'manifest.json'), 'utf8')));
  const expected = object(object(manifest.files)['catalog.json']);
  if (expected.sha256 !== createHash('sha256').update(text).digest('hex') || expected.bytes !== Buffer.byteLength(text)) {
    throw new Error('Previous catalog checksum or size does not match its manifest');
  }
  return validateCatalog(JSON.parse(text));
}

async function main(): Promise<void> {
  const seeds = validateSeeds(JSON.parse(await readFile(process.env.CATALOG_CONFIG ?? new URL('../catalog/seeds.json', import.meta.url), 'utf8')));
  let previous: Catalog | undefined;
  const previousFile = process.env.CATALOG_PREVIOUS;
  if (previousFile) previous = await readCatalog(previousFile);
  const result = await collectCatalog({ seeds, previous, skipSearch: process.env.CATALOG_SKIP_SEARCH === 'true' });
  await writeCatalog(result, process.env.CATALOG_OUTPUT ?? fileURLToPath(new URL('../build/catalog/', import.meta.url)), seeds);
  console.log(JSON.stringify({ records: result.catalog.packages.length, refreshed: result.refreshed, added: result.added, upstream_requests: result.counts }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
