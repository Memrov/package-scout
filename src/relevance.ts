import { object, type Json } from './package-sources.ts';

export function matchKeywords(metadata: Json, keywords: string[]): string[] {
  const fields = [metadata.name, metadata.description, ...(Array.isArray(metadata.keywords) ? metadata.keywords : [])]
    .filter((v): v is string => typeof v === 'string').map(text => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return keywords.filter(term => {
    const tokens = term.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const matches = (word: string, token: string) => {
      const singular = token.length > 3 && !token.endsWith('ss') ? token.replace(/s$/, '') : token;
      return word.startsWith(singular.length > 7 ? singular.slice(0, 7) : singular);
    };
    // Preserve operation direction within a phrase: text-to-speech is not speech-to-text.
    return tokens.length > 0 && fields.some(words => words.some((_, start) =>
      tokens.every((token, offset) => matches(words[start + offset] ?? '', token))));
  });
}

export function browserDeclaration(manifest: Json): Json | null {
  if (manifest.browser === false) return null;
  if (typeof manifest.browser === 'string' || (manifest.browser && typeof manifest.browser === 'object' && Object.keys(manifest.browser).length > 0)) return { field: 'browser', value: manifest.browser };
  function hasBrowser(value: unknown, depth = 0): boolean {
    if (!value || typeof value !== 'object' || depth > 5) return false;
    if (Array.isArray(value)) return value.some(child => hasBrowser(child, depth + 1));
    const entry = object(value);
    return typeof entry.browser === 'string' || Object.values(entry).some(child => hasBrowser(child, depth + 1));
  }
  if (hasBrowser(manifest.exports)) return { field: 'exports', value: 'browser condition' };
  const peers = manifest.peerDependencies && typeof manifest.peerDependencies === 'object' ? Object.keys(manifest.peerDependencies) : [];
  const webFramework = peers.find(name => ['react-dom', 'react', 'vue', 'svelte', 'preact', '@angular/core'].includes(name));
  if (webFramework && !peers.includes('react-native') && !/\breact[- ]native\b/i.test(String(manifest.description))) return { field: 'peerDependencies', value: webFramework };
  if (Array.isArray(manifest.keywords) && manifest.keywords.some(v => typeof v === 'string' && /^(browser|browsers|client-side)$/i.test(v))) return { field: 'keywords', value: 'browser' };
  const description = typeof manifest.description === 'string' ? manifest.description : '';
  if (/\b(?:in|for|inside|within) (?:the |a )?(?:web )?browsers?\b/i.test(description) && !/\b(?:not|no|unsupported).{0,24}browser|browser.{0,24}(?:unsupported|not supported)/i.test(description)) return { field: 'description', value: description };
  return null;
}

export function runtimeEvidence(metadata: Json, runtime: string): Json {
  const description = String(metadata.description ?? '');
  const browser = browserDeclaration(metadata);
  const explicitBrowser = browser && browser.field !== 'peerDependencies';
  // Legacy manifests (Cordova plugins, for one) declare engines as an array. That is not a Node declaration, and not a reason to fail.
  const node = !!metadata.engines && typeof metadata.engines === 'object' && !Array.isArray(metadata.engines) && typeof object(metadata.engines).node === 'string';
  const text = [description, ...(Array.isArray(metadata.keywords) ? metadata.keywords : [])].join(' ');
  const peers = metadata.peerDependencies && typeof metadata.peerDependencies === 'object' ? Object.keys(metadata.peerDependencies) : [];
  const incompatible = runtime === 'browser'
    ? metadata.browser === false || /\b(?:node(?:\.js)?[- ]only|server[- ]only|not (?:for |supported in )?(?:the )?browsers?)\b/i.test(description) ||
      (!explicitBrowser && (peers.includes('react-native') || /\breact[- ]native\b/i.test(description)) && !/\b(?:web|browser)\b/i.test(description))
    : runtime === 'node' && /\bbrowser[- ]only\b/i.test(description);
  if (incompatible) return { requested: runtime, status: 'incompatible', basis: 'Explicit incompatible runtime metadata', preference: 0 };
  if (runtime === 'any') return { requested: runtime, status: 'not_filtered', basis: null, preference: 1 };
  if (runtime === 'browser' && browser) return { requested: runtime, status: 'declared', basis: browser, preference: 2 };
  if (runtime === 'node' && (node || /\bnode(?:js|\.js)?\b/i.test(text))) return { requested: runtime, status: 'declared', basis: node ? 'engines.node' : 'description or keywords', preference: 2 };
  return { requested: runtime, status: 'unknown', basis: 'No conclusive runtime declaration; inspect documentation', preference: 1 };
}

// These are high-level role hints, not a claim that a library solves a task.
// A caller explicitly looking for an adapter/decoder/etc. is not penalized.
export function roleEvidence(metadata: Json, keywords: string[]): Json {
  const description = String(metadata.description ?? '');
  const name = String(metadata.name ?? '');
  const query = keywords.join(' ').toLowerCase();
  const text = `${name} ${description}`;
  const roles = [
    ['adapter', /\b(?:adapter|bindings?|backend)\b/i, /\b(?:adapter|bindings?|backend)\b/i],
    ['plugin', /\b(?:plugin|extension|preset)\b/i, /\b(?:plugin|extension|preset)\b/i],
    ['resolver', /\bresolvers?\b/i, /\bresolvers?\b/i],
    ['formatter', /\b(?:formatter|error messages?|(?:ajv|schema).{0,30}errors?)\b/i, /\b(?:errors?|format\w*|human)\b/i],
    ['store', /\b(?:(?:redis|memcached) store|store for)\b/i, /\b(?:store|redis|memcached)\b/i],
    ['tooltip', /\btooltip\b/i, /\btooltip\b/i],
    ['decoder', /\bjwt[- ]decode\b/i, /\bdecod\w*\b/i],
    ['framework support module', /\b(?:utility functions for|utilities for|shared .{0,80}primitives|core logic for)\b/i, /\b(?:utilit\w*|primitives?|headless|logic)\b/i],
    ['platform specific', /\b(?:react[- ]native|capacitor|jupyterlab|docusaurus|sanity schemas)\b/i, /\b(?:native|capacitor|jupyter|docusaurus|sanity)\b/i],
    ['specialized fork', /\bfork of\b/i, /\bfork\b/i],
    ['calculator', /\b(?:calculators?|sms[- ]length|sms[- ]segments?)\b/i, /\b(?:calculat\w*|length|segments?|count)\b/i],
    ['testing utility', /\b(?:testing|test automation|continuous integration|mocking|fixtures?)\b/i, /\b(?:test\w*|mock\w*|fixtures?)\b/i],
  ] as const;
  const reasons = roles.filter(([, pattern, requested]) => pattern.test(text) && !requested.test(query)).map(([role]) => role);
  return { supporting: reasons.length > 0, reasons, preference: reasons.length ? 0 : 1 };
}

export function adoptionTier(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(Math.log10(Math.max(1, value)));
}

export function packageType(manifest: Json): 'library' | 'workflow-plugin' | 'types' | 'cli' {
  const name = String(manifest.name);
  if (name.startsWith('@types/')) return 'types';
  if (/^(?:@[^/]+\/)?(?:n8n-nodes-|node-red-contrib-|generator-)/.test(name)) return 'workflow-plugin';
  if (manifest.bin && !manifest.main && !manifest.exports && !manifest.module) return 'cli';
  return 'library';
}
