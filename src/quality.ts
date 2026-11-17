import { object, type Json } from './package-sources.ts';
import { adoptionTier } from './relevance.ts';

// Declared runtime support is a late tie-breaker, not relevance: many packages that work in a
// browser or in Node never declare it, so ranking on it promoted small packages that do.
// Explicitly incompatible packages are still excluded before ranking.
const RELEVANCE = ['keyword_match_fraction', 'keyword_specificity', 'package_role_preference', 'descriptive_match_fraction', 'adoption_tier'];

export const RANKING_PROFILES = {
  vibe: {
    goal: 'Quick start, using observed package footprint as a proxy; integration effort is not measured.',
    priorities: [...RELEVANCE, 'direct_runtime_dependency_count', 'declared_install_hook_count', 'direct_dependents', 'runtime_preference', 'weekly_downloads', 'scorecard_score', 'maintained_check_score'],
  },
  production: {
    goal: 'Prefer observed adoption after relevance and risk filters; repository practices provide optional tie-breakers.',
    priorities: [...RELEVANCE, 'direct_dependents', 'runtime_preference', 'weekly_downloads', 'scorecard_score', 'maintained_check_score', 'direct_runtime_dependency_count', 'declared_install_hook_count'],
  },
  internal: {
    goal: 'Prefer a smaller observed installation footprint; external services and operating costs are not assessed.',
    priorities: [...RELEVANCE, 'declared_install_hook_count', 'direct_runtime_dependency_count', 'direct_dependents', 'runtime_preference', 'weekly_downloads', 'scorecard_score', 'maintained_check_score'],
  },
} as const;
export type RankingProfile = keyof typeof RANKING_PROFILES;

const BASE_FILTERS = { min_weekly_downloads: 1000, require_version_evidence: true, require_identified_license: true };
export const PROFILES = {
  vibe: { ...BASE_FILTERS, ranking: 'vibe' },
  production: { ...BASE_FILTERS, ranking: 'production' },
  internal: { ...BASE_FILTERS, ranking: 'internal' },
  // Keep existing client requests valid. These legacy names describe discovery
  // thresholds; they no longer select the retired weighted composite score.
  balanced: { ...BASE_FILTERS, ranking: 'production' },
  established: { ...BASE_FILTERS, min_weekly_downloads: 10000, ranking: 'production' },
  explore: { min_weekly_downloads: 0, require_version_evidence: false, require_identified_license: false, ranking: 'vibe' },
} as const;

export const SCORING = {
  version: '3.3.0', method: 'ordered_evidence', aggregate_score: null,
  meaning: 'Profile-specific lexicographic ordering of observed evidence. No invented composite quality or integration-effort score.',
  profiles: RANKING_PROFILES,
  smaller_is_preferred: ['direct_runtime_dependency_count', 'declared_install_hook_count'],
  missing_data: 'Unknown values remain null. For each priority, observed evidence sorts before unknown evidence; this is a coverage preference, not a poor-quality score.',
  tie_breaker: 'Original discovery position, then package name.',
  dependents: { source: 'npm registry search: the number of packages that depend on each result', role: 'adoption evidence that precedes runtime declarations and weekly downloads within the same download tier', reason: 'Weekly downloads also count installs pulled in by other packages, so a hidden dependency can outrank the library people choose directly.', coverage: 'Reported live for every npm search result; catalog hints and package details have no count.' },
  scorecard: { source: 'OpenSSF Scorecard via deps.dev', scale: 10, required: false, role: 'optional tie-breaker after relevance and observed adoption', methodology_url: 'https://github.com/ossf/scorecard#aggregate-score', selection: 'Lowest observed score among associated source repositories; raw scores are never aged, reweighted, or averaged here.' },
  limits: ['Profile priorities are product policies, not empirically calibrated weights.', 'Dependency counts and declared install hooks are footprint facts, not measured integration effort.', 'Release dates alone do not establish maintenance health; LFX Health Score is not computed.', 'Scorecard describes repository security practices, not package correctness or feature fit.'],
  discovery: 'Keyword coverage, then matched-concept specificity using smoothed inverse document frequency in the retrieved pool, primary-library role hints, descriptive matches and adoption tier precede profile preferences. Declared runtime support breaks ties after direct dependents. Specificity is retrieval evidence, not a quality or fit score. Missing runtime declarations remain eligible and unverified.',
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

function observedNumber(value: unknown, maximum = Infinity): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
}

export function qualityEvidence(candidate: Json, position: number, profile: RankingProfile, now: string): Json {
  const repositories = Array.isArray(candidate.repositories) ? candidate.repositories.map(object) : [];
  const cards = repositories.flatMap<Json & { score: number; source_repository: unknown }>(repository => {
    if (!repository.scorecard) return [];
    const card = object(repository.scorecard);
    const score = observedNumber(card.score, 10);
    return score === null ? [] : [{ ...card, score, source_repository: repository.id ?? null }];
  }).sort((a, b) => a.score - b.score || String(a.source_repository).localeCompare(String(b.source_repository)));
  const selected = cards[0] ?? null;
  const maintained = cards.flatMap(card => Array.isArray(card.checks) ? card.checks.map(object).filter(check => check.name === 'Maintained').flatMap(check => {
    const score = observedNumber(check.score, 10);
    return score === null ? [] : [{ score, source_repository: card.source_repository, assessed_at: card.assessed_at ?? null }];
  }) : []).sort((a, b) => a.score - b.score || String(a.source_repository).localeCompare(String(b.source_repository)))[0] ?? null;
  const dateAge = (value: unknown) => {
    const date = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(date) && date <= Date.parse(now) ? Math.floor((Date.parse(now) - date) / 86400000) : null;
  };
  const signals = {
    keyword_match_fraction: observedNumber(candidate.keyword_match_fraction, 1),
    keyword_specificity: observedNumber(candidate.keyword_specificity, 1),
    package_role_preference: observedNumber(candidate.package_role_preference, 1),
    descriptive_match_fraction: observedNumber(candidate.descriptive_match_fraction, 1),
    runtime_preference: observedNumber(candidate.runtime_preference, 2),
    adoption_tier: adoptionTier(candidate.weekly_downloads),
    direct_runtime_dependency_count: observedNumber(candidate.direct_runtime_dependency_count),
    declared_install_hook_count: Array.isArray(candidate.declared_install_hooks) ? candidate.declared_install_hooks.length : null,
    scorecard_score: selected?.score ?? null,
    maintained_check_score: maintained?.score ?? null,
    direct_dependents: observedNumber(candidate.direct_dependents),
    weekly_downloads: observedNumber(candidate.weekly_downloads),
  };
  return {
    score: null, profile, method: SCORING.method, priorities: RANKING_PROFILES[profile].priorities, signals,
    discovery_position: position,
    scorecard: selected ? { score: selected.score, assessed_at: selected.assessed_at ?? null, repository: selected.repository ?? null, source_repository: selected.source_repository, age_days: dateAge(selected.assessed_at) } : null,
    scorecard_coverage: { associated_repositories: repositories.length, scored_repositories: cards.length },
    maintenance: { maintained_check: maintained, health_score: null, status: maintained ? 'scorecard_check_available' : 'not_assessed', latest_release_at: candidate.published_at ?? null, release_age_days: dateAge(candidate.published_at) },
    integration_effort: { score: null, status: 'not_assessed', reason: 'No integration-effort scoring provider is configured. Footprint signals do not measure integration effort.' },
    functional_evaluation: { status: 'not_assessed', reason: 'GitHub evaluation artifacts are separate evidence and are not automatically attached to this search.' },
    unknown_signals: [...Object.entries(signals).filter(([, value]) => value === null).map(([key]) => key),
      ...(Array.isArray(candidate.known_direct_advisories) ? [] : ['direct_advisories']),
      ...(selected && dateAge(selected.assessed_at) === null ? ['scorecard_date'] : []),
      ...(dateAge(candidate.published_at) === null ? ['release_date'] : []),
      'integration_effort', 'functional_evaluation'],
  };
}

export function compareCandidates(a: Json, b: Json): number {
  const left = object(a.quality);
  const right = object(b.quality);
  const leftSignals = object(left.signals);
  const rightSignals = object(right.signals);
  for (const key of left.priorities as string[]) {
    const l = leftSignals[key];
    const r = rightSignals[key];
    const leftKnown = typeof l === 'number';
    const rightKnown = typeof r === 'number';
    if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
    if (leftKnown && rightKnown && l !== r) return SCORING.smaller_is_preferred.includes(key) ? l - r : r - l;
  }
  return Number(left.discovery_position) - Number(right.discovery_position) || String(a.name).localeCompare(String(b.name));
}
