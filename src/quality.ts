import { object, type Json } from './package-sources.ts';

export const SCORING = {
  version: '1.0.0', scale: 100,
  weights: { query_relevance: 35, adoption: 20, advisory_and_scorecard_signals: 20, dependency_footprint: 15, release_recency: 10 },
  meaning: 'A transparent metadata ranking heuristic, not a probability of correctness or proof of feature fit.',
};
export const PROFILES = {
  balanced: { min_weekly_downloads: 100, require_version_evidence: true, require_identified_license: true },
  established: { min_weekly_downloads: 10000, require_version_evidence: true, require_identified_license: true },
  explore: { min_weekly_downloads: 0, require_version_evidence: false, require_identified_license: false },
};

export function exclusionReasons(candidate: Json, args: Json): string[] {
  const profile = PROFILES[args.quality_profile as keyof typeof PROFILES];
  const reasons: string[] = [];
  if (!args.include_deprecated && candidate.deprecated !== null) reasons.push('deprecated');
  if (!args.include_prerelease && String(candidate.version).includes('-')) reasons.push('prerelease');
  if (Array.isArray(candidate.known_direct_advisories) && candidate.known_direct_advisories.length) reasons.push('known_direct_advisories');
  const identified = Array.isArray(candidate.licenses) && candidate.licenses.some(v => typeof v === 'string' && v.trim() && !/^(non-standard|unknown|unlicensed)$/i.test(v));
  if (profile.require_identified_license && !identified) reasons.push('unidentified_license');
  if (Array.isArray(candidate.licenses) && candidate.licenses.some(v => typeof v === 'string' && /^unlicensed$/i.test(v))) reasons.push('unlicensed');
  if (profile.require_version_evidence && candidate.deps_dev_status !== 'found') reasons.push('missing_version_evidence');
  const minimum = args.min_weekly_downloads as number;
  if (minimum > 0 && (typeof candidate.weekly_downloads !== 'number' || candidate.weekly_downloads < minimum)) reasons.push('below_download_floor');
  if ((args.licenses_any as string[]).length && !(Array.isArray(candidate.licenses) && candidate.licenses.some(v => (args.licenses_any as string[]).includes(v)))) reasons.push('license_filter');
  return reasons;
}

export function qualityScore(candidate: Json, position: number, poolSize: number, now: string): Json {
  const downloads = typeof candidate.weekly_downloads === 'number' ? candidate.weekly_downloads : null;
  const count = typeof candidate.direct_runtime_dependency_count === 'number' ? candidate.direct_runtime_dependency_count : null;
  const advisories = Array.isArray(candidate.known_direct_advisories) ? candidate.known_direct_advisories : null;
  const published = typeof candidate.published_at === 'string' ? Date.parse(candidate.published_at) : NaN;
  const ageDays = Number.isFinite(published) ? Math.max(0, (Date.parse(now) - published) / 86400000) : null;
  const cards = Array.isArray(candidate.repositories) ? candidate.repositories.map(object).flatMap(p => p.scorecard ? [object(p.scorecard)] : []) : [];
  const scorecards = cards.map(card => {
    if (typeof card.score !== 'number' || card.score < 0 || card.score > 10 || typeof card.assessed_at !== 'string') return 0;
    const date = Date.parse(card.assessed_at);
    if (!Number.isFinite(date)) return 0;
    const age = Math.max(0, (Date.parse(now) - date) / 86400000);
    return card.score * (age <= 180 ? 1 : age <= 365 ? 0.5 : 0.25);
  });
  const round = (value: number) => Math.round(value * 10) / 10;
  const components = {
    query_relevance: round(25 * (typeof candidate.keyword_match_fraction === 'number' ? candidate.keyword_match_fraction : 0) + 10 * (1 - 0.7 * position / Math.max(1, poolSize - 1))),
    adoption: downloads === null ? 0 : round(20 * Math.min(1, Math.log10(Math.max(0, downloads) + 1) / 6)),
    advisory_and_scorecard_signals: round((advisories && !advisories.length ? 10 : 0) + Math.max(0, ...scorecards)),
    dependency_footprint: count === null ? 0 : round(15 / (1 + Math.log2(count + 1))),
    release_recency: ageDays === null ? 0 : ageDays <= 90 ? 10 : ageDays <= 365 ? 8 : ageDays <= 1095 ? 5 : 2,
  };
  return { score: round(Object.values(components).reduce((sum, value) => sum + value, 0)), components,
    unknown_signals: [downloads === null ? 'weekly_downloads' : null, count === null ? 'dependency_footprint' : null, advisories === null ? 'direct_advisories' : null, ageDays === null ? 'release_date' : null, !cards.length ? 'scorecard' : null].filter(Boolean),
    release_age_days: ageDays === null ? null : Math.floor(ageDays),
  };
}
