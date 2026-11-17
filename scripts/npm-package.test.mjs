import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('the npm tarball installs offline and its package-scout command serves MCP', { timeout: 60000 }, async t => {
  assert.ok(process.env.npm_execpath, 'Run the package test with npm test or npm exec -- node --test');
  const temp = await mkdtemp(join(tmpdir(), 'scout npm release '));
  t.after(() => rm(temp, { recursive: true, force: true }));
  function npm(args, input) {
    const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
      cwd: temp, encoding: 'utf8', input, timeout: 20000,
      env: { ...process.env, npm_config_cache: join(temp, 'cache'), npm_config_update_notifier: 'false' },
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    return result.stdout;
  }
  const packagePath = fileURLToPath(new URL('../npm/', import.meta.url));
  const [packed] = JSON.parse(npm(['pack', packagePath, '--ignore-scripts', '--json', '--pack-destination', temp]));
  assert.deepEqual(packed.files.map(file => file.path).sort(), ['LICENSE', 'README.md', 'package.json', 'server.mjs']);
  const installed = join(temp, 'installed');
  npm(['install', '--prefix', installed, '--ignore-scripts', '--offline', '--no-audit', '--no-fund', join(temp, packed.filename)]);
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ];
  const output = npm(['exec', '--prefix', installed, '--offline', '--', 'package-scout'], messages.map(message => JSON.stringify(message)).join('\n') + '\n');
  const replies = output.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(replies.length, 2);
  assert.equal(replies[0].result.protocolVersion, '2025-11-25');
  assert.deepEqual(replies[1].result.tools.map(tool => tool.name), ['search_packages', 'get_package_details']);
});
