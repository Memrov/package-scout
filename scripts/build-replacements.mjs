// Compacts e18e's module-replacements manifests into catalog/replacements.json, which the server bundles.
// Run after updating the pinned module-replacements dev dependency; npm test checks the file is current.
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const check = process.argv.includes('--check');
const pkg = new URL('node_modules/module-replacements/', root);
const { version } = JSON.parse(await readFile(new URL('package.json', pkg), 'utf8'));
const notice = (await readFile(new URL('LICENSE', pkg), 'utf8')).trim();
const BROWSERS = new Set(['chrome', 'edge', 'firefox', 'safari']);

function link(url) {
  if (!url) return null;
  if (typeof url === 'string') return url;
  if (url.type === 'mdn') return `https://developer.mozilla.org/en-US/docs/${url.id}`;
  if (url.type === 'node') return `https://nodejs.org/${url.id}`;
  if (url.type === 'e18e') return `https://e18e.dev/docs/replacements/${url.id}`;
  return null;
}

// Where a built-in replacement is known to run. Unknown stays null, and Scout then only cites it.
function runtimes(replacement) {
  const engines = Array.isArray(replacement.engines) ? replacement.engines.map(e => e.engine) : [];
  const found = new Set();
  if (engines.includes('nodejs') || (!engines.length && (replacement.nodeFeatureId || replacement.url?.type === 'node'))) found.add('node');
  if (engines.some(engine => BROWSERS.has(engine))) found.add('browser');
  return found.size ? [...found].sort() : null;
}

const modules = {};
const replacements = {};
for (const [file, kind] of [['native', 'native'], ['micro-utilities', 'micro-utility'], ['preferred', 'preferred']]) {
  const manifest = JSON.parse(await readFile(new URL(`manifests/${file}.json`, pkg), 'utf8'));
  for (const [id, r] of Object.entries(manifest.replacements)) {
    const node = r.engines?.find(e => e.engine === 'nodejs')?.minVersion ?? null;
    const entry = Object.fromEntries(Object.entries({
      type: r.type, docs: link(r.url), runtimes: r.type === 'native' ? runtimes(r) : null, node: r.type === 'native' ? node : null,
      module: r.replacementModule ?? null, description: r.description ?? null, example: r.example ?? null,
    }).filter(([, value]) => value !== null));
    if (replacements[id] && JSON.stringify(replacements[id]) !== JSON.stringify(entry)) throw new Error(`Conflicting replacement ${id}`);
    replacements[id] = entry;
  }
  for (const [name, mapping] of Object.entries(manifest.mappings)) {
    for (const id of mapping.replacements) if (!manifest.replacements[id]) throw new Error(`${name} maps to unknown replacement ${id}`);
    (modules[name] ??= []).push({ kind, replacements: mapping.replacements, ...(link(mapping.url) ? { docs: link(mapping.url) } : {}) });
  }
}

const sorted = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')));
const data = {
  source: `module-replacements@${version}`, homepage: 'https://github.com/e18e/module-replacements', license: 'MIT', notice,
  modules: sorted(modules), replacements: sorted(replacements),
};
const text = `${JSON.stringify(data, null, 1)}\n`;
const target = new URL('catalog/replacements.json', root);
if (check) {
  const current = await readFile(target, 'utf8').catch(() => null);
  if (current !== text) throw new Error('catalog/replacements.json is stale. Run npm run replacements:build.');
  console.log('catalog/replacements.json matches module-replacements');
} else {
  await writeFile(target, text);
  console.log(`Wrote ${Object.keys(modules).length} modules and ${Object.keys(replacements).length} replacements from module-replacements@${version}`);
}
