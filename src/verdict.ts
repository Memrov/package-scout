import { object, type Json } from './package-sources.ts';
import { replacementCaution } from './replacements.ts';

// Scout's short answer. The facts come first and stay sober; the last line is allowed to have fun.
const CLOSERS = ['Someone already wrote it.', 'Put the keyboard down.', "That's the whole job.", 'Scout has never written one of these.', 'Go outside.'];
const SMALL_CROWD = 10000;

export function formatCount(value: number): string {
  for (const [unit, size] of [['B', 1e9], ['M', 1e6], ['K', 1e3]] as const) {
    if (value < size) continue;
    const scaled = value / size;
    const text = scaled >= 99.95 ? String(Math.round(scaled)) : scaled.toFixed(1).replace(/\.0$/, '');
    // 999,960 is "1M", not "1000K".
    return text === '1000' && unit !== 'B' ? `1${unit === 'K' ? 'M' : 'B'}` : `${text}${unit}`;
  }
  return String(Math.round(value));
}

const list = (items: string[]) => items.map(item => `"${item}"`).join(' and ');

function facts(candidate: Json): string {
  const parts: string[] = [];
  if (typeof candidate.weekly_downloads === 'number') parts.push(`${formatCount(candidate.weekly_downloads)} downloads a week`);
  if (Array.isArray(candidate.licenses) && candidate.licenses.length) parts.push(candidate.licenses.join(', '));
  const dependencies = candidate.direct_runtime_dependency_count;
  if (typeof dependencies === 'number') parts.push(dependencies === 0 ? 'zero dependencies' : `${dependencies} ${dependencies === 1 ? 'dependency' : 'dependencies'}`);
  if (Array.isArray(candidate.known_direct_advisories) && !candidate.known_direct_advisories.length) parts.push('no known direct advisories');
  const text = parts.join(', ');
  return text ? `${text[0].toUpperCase()}${text.slice(1)}.` : '';
}

export function verdictFor(result: Json): string {
  const packages = result.packages as Json[];
  const platform = result.platform ? object(result.platform) : null;
  const top = packages[0];
  const pick = top ? `${top.name}@${top.version}` : null;
  if (platform) {
    const runtimes = platform.runtimes as string[];
    if (platform.source) {
      const where = runtimes.length > 1 ? '' : runtimes[0] === 'node' ? ' in Node' : ' in the browser';
      return `Built-in first: e18e lists ${platform.builtin} as a replacement for ${platform.replaces}${where}.${pick ? ` If it does not cover what you need, Scout's pick is ${pick}.` : ''}`;
    }
    const where = runtimes.length > 1 ? '' : runtimes[0] === 'node' ? ' to Node' : ' to the browser';
    return `Don't install anything: ${platform.builtin} is built in${where}.${pick ? ` If that is not enough, Scout's pick is ${pick}.` : ''}`;
  }
  if (!top) {
    const wanted = list(object(result.constraints).keywords as string[]);
    return result.next_search
      ? `Nothing clears Scout's bar for ${wanted}. Retry with next_search to include small packages, or try another keyword.`
      : `Nothing clears Scout's bar for ${wanted}. Try another keyword. Or, tragically, write it yourself.`;
  }
  const relevance = object(top.relevance_evidence);
  const summary = facts(top);
  if (relevance.match_type !== 'complete') {
    return `Partial match: ${pick} mentions ${list(relevance.matched_keywords as string[])} but not ${list(relevance.unmatched_keywords as string[])}.${summary ? ` ${summary}` : ''} Read its README before you trust it.`;
  }
  if (typeof top.weekly_downloads !== 'number' || top.weekly_downloads < SMALL_CROWD) {
    return `Closest fit: ${pick}, but it is a small crowd.${summary ? ` ${summary}` : ''} Read its README before you trust it.`;
  }
  const closer = CLOSERS[[...String(top.name)].reduce((sum, character) => sum + character.charCodeAt(0), 0) % CLOSERS.length];
  return `Scout's pick: ${pick}.${summary ? ` ${summary}` : ''} ${closer}`;
}

function cautions(candidate: Json): string[] {
  const notes: string[] = [];
  const relevance = object(candidate.relevance_evidence);
  const runtime = object(candidate.runtime_evidence);
  const role = object(candidate.role_evidence);
  if (relevance.match_type !== 'complete') notes.push(`Metadata mentions ${list(relevance.matched_keywords as string[])} but not ${list(relevance.unmatched_keywords as string[])}.`);
  if (runtime.status === 'unknown') notes.push(`No ${runtime.requested} support is declared. Check the README.`);
  if (role.supporting) notes.push(`Role hint: ${(role.reasons as string[]).join(', ')}. It may support a library instead of being one.`);
  if (Array.isArray(candidate.declared_install_hooks) && candidate.declared_install_hooks.length) notes.push(`Runs install scripts: ${candidate.declared_install_hooks.join(', ')}.`);
  if (typeof candidate.weekly_downloads === 'number' && candidate.weekly_downloads < SMALL_CROWD) notes.push(`Small crowd: ${formatCount(candidate.weekly_downloads)} downloads a week.`);
  if (typeof candidate.direct_runtime_dependency_count === 'number' && candidate.direct_runtime_dependency_count >= 10) notes.push(`Brings ${candidate.direct_runtime_dependency_count} direct dependencies.`);
  const replacement = replacementCaution(candidate.replacements as Json | null | undefined);
  if (replacement) notes.push(replacement);
  return notes;
}

const clip = (value: unknown) => typeof value === 'string' ? (value.length > 200 ? `${value.slice(0, 197)}...` : value) : null;

// The default answer: what to install, why, and what to watch for. Everything else stays behind detail=full.
export function compact(result: Json): Json {
  const packages = (result.packages as Json[]).map(candidate => {
    const relevance = object(candidate.relevance_evidence);
    const scorecard = object(candidate.quality).scorecard;
    const repository = (candidate.repositories as Json[])[0];
    const notes = cautions(candidate);
    return {
      name: candidate.name, version: candidate.version, install: candidate.install_command, description: clip(candidate.description),
      weekly_downloads: candidate.weekly_downloads, direct_dependents: candidate.direct_dependents ?? null, licenses: candidate.licenses, dependencies: candidate.direct_runtime_dependency_count,
      runtime: object(candidate.runtime_evidence).status, match: relevance.match_type,
      ...(relevance.match_type === 'complete' ? {} : { unmatched_keywords: relevance.unmatched_keywords }),
      published_at: candidate.published_at, openssf_scorecard: scorecard ? object(scorecard).score : null,
      npm_url: candidate.npm_url, repository: repository?.url ?? null,
      ...(notes.length ? { cautions: notes } : {}),
    };
  });
  return {
    verdict: result.verdict ?? verdictFor(result), platform: result.platform ?? null, packages, returned: packages.length,
    ...(result.next_search ? { next_search: result.next_search } : {}),
    warnings: result.warnings, detail: 'compact',
    more: 'These are metadata matches. Call get_package_details(include_readme=true) before recommending a pick. Pass detail="full" for ranking signals, filter counts and sources.',
    meta: result.meta, attribution: result.attribution, evidence_limits: result.evidence_limits,
  };
}
