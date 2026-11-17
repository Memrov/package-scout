import { type Json } from './package-sources.ts';
import data from '../catalog/replacements.json' with { type: 'json' };

// e18e's module-replacements (MIT): community guidance on packages a built-in, a few lines,
// or a lighter package can replace. Scout cites it; it never changes which packages rank first.
type Replacement = { type: string; docs?: string; runtimes?: string[]; node?: string; module?: string; description?: string; example?: string };
type Mapping = { kind: 'native' | 'micro-utility' | 'preferred'; replacements: string[]; docs?: string };
const MODULES = data.modules as Record<string, Mapping[]>;
const REPLACEMENTS = data.replacements as Record<string, Replacement>;

export const REPLACEMENTS_SOURCE = { name: 'e18e module-replacements', version: data.source, homepage: data.homepage, license: data.license };

export function replacementsFor(name: string): Json | null {
  const mappings = Object.hasOwn(MODULES, name) ? MODULES[name] : null;
  if (!mappings) return null;
  return {
    source: REPLACEMENTS_SOURCE.name,
    kinds: [...new Set(mappings.map(m => m.kind))],
    docs: mappings.find(m => m.docs)?.docs ?? null,
    suggestions: [...new Set(mappings.flatMap(m => m.replacements))].map(id => ({ id, ...REPLACEMENTS[id] })),
  };
}

// The first built-in e18e lists for this package that is known to run where the caller asked.
export function builtInFor(name: string, runtime: string): Json | null {
  const found = replacementsFor(name);
  if (!found) return null;
  for (const suggestion of found.suggestions as (Replacement & { id: string })[]) {
    if (suggestion.type !== 'native' || !suggestion.runtimes) continue;
    if (runtime !== 'any' && !suggestion.runtimes.includes(runtime)) continue;
    return {
      builtin: suggestion.id, example: null, runtimes: suggestion.runtimes,
      needs: suggestion.node && suggestion.runtimes.includes('node') ? `Node.js ${suggestion.node} or newer` : null,
      limits: `e18e lists this as a replacement for ${name}. Check that it covers what you use from ${name}.`,
      note: null, docs: suggestion.docs ?? found.docs, source: REPLACEMENTS_SOURCE.name, replaces: name,
    };
  }
  return null;
}

// One short caution per package e18e covers, naming what replaces it.
export function replacementCaution(replacements: Json | null | undefined): string | null {
  if (!replacements) return null;
  const suggestions = replacements.suggestions as (Replacement & { id: string })[];
  const kinds = replacements.kinds as string[];
  const docs = replacements.docs ? ` ${replacements.docs}` : '';
  const native = suggestions.filter(s => s.type === 'native').map(s => s.id);
  const snippet = suggestions.find(s => s.type === 'simple');
  const removal = suggestions.find(s => s.type === 'removal');
  const named = suggestions.filter(s => s.type === 'native' || s.type === 'documented').map(s => s.module ?? s.id);
  if (kinds.includes('micro-utility') && snippet) return `e18e: a few lines replace it. ${snippet.description}${snippet.example ? ` Example: ${snippet.example.split('\n')[0]}` : ''}`;
  if (kinds.includes('native') && native.length) return `e18e: no package needed; use ${native.join(' or ')}.${docs}`;
  if (named.length) return `e18e suggests instead: ${named.join(', ')}.${docs}`;
  if (removal?.description) return `e18e: ${removal.description}.${docs}`;
  return null;
}
