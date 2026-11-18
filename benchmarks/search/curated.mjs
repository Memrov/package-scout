// Derives benchmark queries from community-curated lists at pinned commits. Nothing from the
// lists is stored in this repository: each run fetches the pinned file and applies these rules.
import { createHash } from 'node:crypto';

const STOP = new Set(['and', 'of', 'the', 'for', 'with', 'a', 'an', 'js', 'javascript']);
const NAME = /^@?[a-z0-9][a-z0-9._/-]*$/;

// Every right answer a list item can name: its link text and its GitHub repository name, as written and in common npm spellings.
function answers(block) {
  const out = new Set();
  // Line by line with an anchored, linear pattern: the lists are downloaded, so no backtracking across lines.
  for (const line of block.split('\n')) {
    const item = line.match(/^[ \t]*[-*] \[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/);
    if (!item) continue;
    const [, label, url] = item;
    const text = label.trim().toLowerCase();
    for (const name of [text, text.replaceAll(' ', '-'), text.endsWith('.js') ? text.slice(0, -3) : text, text.replaceAll('.js', 'js')]) {
      if (NAME.test(name)) out.add(name);
    }
    const repo = url.match(/^https?:\/\/github\.com\/[^/]+\/([^/#?]+)/)?.[1]?.toLowerCase();
    if (repo) for (const name of [repo, repo.endsWith('.js') ? repo.slice(0, -3) : repo, repo.startsWith('node-') ? repo.slice(5) : repo]) out.add(name);
  }
  return out;
}

export function deriveQueries(markdown, source) {
  const start = markdown.indexOf(source.start);
  if (start < 0) throw new Error(`${source.name}: start heading not found`);
  const stop = source.stop ? markdown.indexOf(source.stop, start) : -1;
  const body = markdown.slice(start, stop < 0 ? undefined : stop);
  // Fixed patterns rather than one built from configuration text.
  const heading = { '##': /^## (.+)$/gm, '###': /^### (.+)$/gm }[source.level];
  if (!heading) throw new Error(`${source.name}: level must be ## or ###`);
  const marks = [...body.matchAll(heading)];
  const exclude = new Set(source.exclude);
  const queries = [];
  for (const [index, mark] of marks.entries()) {
    const name = mark[1].trim();
    if (exclude.has(name.toLowerCase())) continue;
    let block = body.slice(mark.index + mark[0].length, marks[index + 1]?.index ?? body.length);
    // A top-level category counts only its own items, not those of its subsections.
    if (source.level === '##') block = block.split('\n### ')[0];
    const good = [...answers(block)].sort();
    if (good.length < 3) continue;
    const keywords = name.toLowerCase().split(/[\s/&]+/).filter(word => word && !STOP.has(word));
    const id = `${source.name}:${name}`;
    const split = BigInt(`0x${createHash('sha1').update(id).digest('hex')}`) % 2n === 0n ? 'dev' : 'test';
    queries.push({ id, keywords, runtime: source.runtime, good, split, source: source.name });
  }
  return queries;
}

export function fingerprint(queries) {
  return createHash('sha256').update(JSON.stringify(queries.map(q => [q.id, q.keywords, q.good, q.split]))).digest('hex');
}

export async function loadCurated(sources, { fetchText }) {
  const all = [];
  for (const source of sources) {
    const queries = deriveQueries(await fetchText(source.url), source);
    const actual = { queries: queries.length, sha256: fingerprint(queries) };
    if (actual.queries !== source.fingerprint.queries || actual.sha256 !== source.fingerprint.sha256) {
      throw new Error(`${source.name} no longer derives the pinned query set (${JSON.stringify(actual)}). Update sources.json deliberately.`);
    }
    all.push(...queries);
  }
  return all;
}
