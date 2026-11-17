import type { Json } from './package-sources.ts';
import catalog from '../catalog/platform.json' with { type: 'json' };

// Jobs the platform already does. A package is for a rabbit hole, never for a few lines.
export type PlatformEntry = {
  id: string; phrases: string[]; with?: string[]; runtimes: string[];
  builtin: string; example: string; verify?: string; needs?: string; limits?: string; docs: string; note?: string;
};
export const PLATFORM: PlatformEntry[] = catalog.entries;

const STOP = new Set(['a', 'an', 'the', 'to', 'for', 'in', 'of', 'with', 'and', 'or', 'on', 'from']);
// Words that say where or how, never what. They may surround a concept without changing it.
const FILLER = ['javascript', 'js', 'typescript', 'ts', 'node', 'nodejs', 'browser', 'web', 'npm', 'simple', 'tiny', 'small', 'fast',
  'lightweight', 'utility', 'util', 'helper', 'function', 'library', 'lib', 'package', 'module', 'native', 'vanilla'];

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(word => word && !STOP.has(word));
const singular = (word: string) => word.length > 3 && !word.endsWith('ss') ? word.replace(/s$/, '') : word;
export const concept = (text: string) => words(text).map(singular);
// Word order does not change these concepts: "pad left" is "left pad".
const key = (tokens: string[]) => [...new Set(tokens)].sort().join(' ');

const index = PLATFORM.map(entry => ({
  entry,
  phrases: new Set(entry.phrases.map(phrase => key(concept(phrase)))),
  fillers: new Set([...FILLER, ...(entry.with ?? [])].flatMap(concept)),
}));

// Deliberately strict. The whole request must be one listed concept, give or take
// filler words. "uuid" matches; "uuid validate" does not, because the built-in cannot validate.
export function platformAnswer(keywords: string[], runtime: string): Json | null {
  const raw = keywords.flatMap(words);
  const tokens = raw.map(singular);
  if (!tokens.length) return null;
  const wanted = runtime !== 'any' ? runtime : raw.includes('browser') ? 'browser' : raw.includes('node') || raw.includes('nodejs') ? 'node' : 'any';
  for (const { entry, phrases, fillers } of index) {
    if (wanted !== 'any' && !entry.runtimes.includes(wanted)) continue;
    const core = tokens.filter(token => !fillers.has(token));
    if (!phrases.has(key(tokens)) && !(core.length && phrases.has(key(core)))) continue;
    return {
      builtin: entry.builtin, example: entry.example, runtimes: entry.runtimes,
      needs: entry.needs ?? null, limits: entry.limits ?? null, note: entry.note ?? null, docs: entry.docs,
    };
  }
  return null;
}
