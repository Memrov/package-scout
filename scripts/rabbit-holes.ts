// Runs every search in catalog/rabbit-holes.json against the live sources and prints
// the README's rabbit-hole table, so the table only ever shows what Scout really returns.
import { createHandler } from '../worker/index.ts';
import { object, type Json } from '../src/package-sources.ts';
import { formatCount } from '../src/verdict.ts';
import catalog from '../catalog/rabbit-holes.json' with { type: 'json' };

const handler = createHandler();
const rows: string[] = [];
for (const hole of catalog.holes as { job: string; keywords: string[]; runtime?: string }[]) {
  const args = { keywords: hole.keywords, ...(hole.runtime ? { runtime: hole.runtime } : {}) };
  const response = await handler.fetch(new Request('http://127.0.0.1/v1/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) }));
  const data = object(await response.json());
  const [first] = (data.packages ?? []) as Json[];
  const asked = `${hole.keywords.map(keyword => `\`${keyword}\``).join(' + ')}${hole.runtime ? `, ${hole.runtime}` : ''}`;
  rows.push(first
    ? `| ${hole.job} | ${asked} | [\`${first.name}\`](${first.npm_url}) | ${typeof first.weekly_downloads === 'number' ? formatCount(first.weekly_downloads) : 'unknown'} |`
    : `| ${hole.job} | ${asked} | nothing cleared the bar | |`);
  console.error(`${hole.job}: ${data.verdict ?? data.error}`);
}
console.log(`Checked live on ${new Date().toISOString().slice(0, 10)}.\n`);
console.log(['| The job | Scout is asked for | Scout\'s first pick | Downloads a week |', '| --- | --- | --- | ---: |', ...rows].join('\n'));
