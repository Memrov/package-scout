import test from 'node:test';
import assert from 'node:assert/strict';
import { builtInFor, replacementCaution, replacementsFor } from '../src/replacements.ts';
import data from '../catalog/replacements.json' with { type: 'json' };

test('the bundled e18e data keeps its MIT notice and resolves every mapping', () => {
  assert.equal(data.license, 'MIT');
  assert.match(data.notice, /^MIT License/);
  assert.match(data.source, /^module-replacements@\d+\.\d+\.\d+$/);
  for (const [name, mappings] of Object.entries(data.modules)) {
    for (const mapping of mappings) for (const id of mapping.replacements) assert.ok(Object.hasOwn(data.replacements, id), `${name} -> ${id}`);
  }
});

test('lookups ignore inherited names and unknown packages', () => {
  assert.equal(replacementsFor('constructor'), null);
  assert.equal(replacementsFor('__proto__'), null);
  assert.equal(replacementsFor('definitely-not-listed-package'), null);
  assert.equal(builtInFor('definitely-not-listed-package', 'any'), null);
  assert.equal(replacementCaution(null), null);
});

test('built-ins respect the requested runtime and skip replacements with unknown runtimes', () => {
  assert.equal(builtInFor('dotenv', 'node')?.builtin, 'process.loadEnvFile');
  assert.equal(builtInFor('dotenv', 'browser'), null);
  assert.equal(builtInFor('left-pad', 'browser')?.builtin, 'String.prototype.padStart');
  for (const [name, mappings] of Object.entries(data.modules)) {
    const offered = builtInFor(name, 'any');
    if (!offered) continue;
    const replacement = (data.replacements as Record<string, { type: string; runtimes?: string[] }>)[String(offered.builtin)];
    assert.equal(replacement.type, 'native', name);
    assert.ok(replacement.runtimes?.length, name);
    assert.ok(mappings.some(m => m.replacements.includes(String(offered.builtin))), name);
  }
});

test('cautions name the replacement kind', () => {
  assert.match(String(replacementCaution(replacementsFor('is-number'))), /^e18e: a few lines replace it\. You can use `typeof`/);
  assert.match(String(replacementCaution(replacementsFor('moment'))), /^e18e suggests instead: day\.js, date-fns, luxon, Date, Temporal\. https:\/\/e18e\.dev\/docs\/replacements\/moment$/);
});
