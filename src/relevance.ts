import { object, type Json } from './package-sources.ts';

export function matchKeywords(metadata: Json, keywords: string[]): string[] {
  const text = [metadata.name, metadata.description, ...(Array.isArray(metadata.keywords) ? metadata.keywords : [])].filter(v => typeof v === 'string').join(' ').toLowerCase();
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  return keywords.filter(term => {
    const tokens = term.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.length > 0 && tokens.every(token => words.some(word => word.startsWith(token.length > 7 ? token.slice(0, 7) : token)));
  });
}

export function browserDeclaration(manifest: Json): Json | null {
  if (manifest.browser === false) return null;
  if (typeof manifest.browser === 'string' || (manifest.browser && typeof manifest.browser === 'object' && Object.keys(manifest.browser).length > 0)) return { field: 'browser', value: manifest.browser };
  function hasBrowser(value: unknown, depth = 0): boolean {
    if (!value || typeof value !== 'object' || depth > 5) return false;
    const entry = object(value);
    return typeof entry.browser === 'string' || Object.values(entry).some(child => hasBrowser(child, depth + 1));
  }
  if (hasBrowser(manifest.exports)) return { field: 'exports', value: 'browser condition' };
  if (Array.isArray(manifest.keywords) && manifest.keywords.some(v => typeof v === 'string' && /^(browser|browsers|client-side)$/i.test(v))) return { field: 'keywords', value: 'browser' };
  const description = typeof manifest.description === 'string' ? manifest.description : '';
  if (/\b(?:in|for|inside|within) (?:the |a )?(?:web )?browsers?\b/i.test(description) && !/\b(?:not|no|unsupported).{0,24}browser|browser.{0,24}(?:unsupported|not supported)/i.test(description)) return { field: 'description', value: description };
  return null;
}

export function packageType(manifest: Json): 'library' | 'workflow-plugin' | 'types' | 'cli' {
  const name = String(manifest.name);
  if (name.startsWith('@types/')) return 'types';
  if (/^(?:@[^/]+\/)?(?:n8n-nodes-|node-red-contrib-|generator-)/.test(name)) return 'workflow-plugin';
  if (manifest.bin && !manifest.main && !manifest.exports && !manifest.module) return 'cli';
  return 'library';
}
