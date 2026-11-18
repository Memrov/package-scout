import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../claude-code/', import.meta.url));

async function launch(t, pluginRoot = root) {
  const config = JSON.parse(await readFile(join(pluginRoot, '.claude-plugin/plugin.json'), 'utf8')).mcpServers['package-scout'];
  const child = spawn(config.command, config.args.map(arg => arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot)), {
    cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  t.after(() => { child.kill(); });
  return {
    send: value => child.stdin.write(typeof value === 'string' ? value : JSON.stringify(value) + '\n'),
    async reply() {
      const line = await lines.next();
      assert.equal(line.done, false, `server ended before replying: ${stderr}`);
      return JSON.parse(line.value);
    },
  };
}

const request = (id, method, params = {}) => ({ jsonrpc: '2.0', id, method, params });

test('stdio initializes before EOF and ignores interleaved notifications', { timeout: 10000 }, async t => {
  const server = await launch(t);
  server.send(request(0, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } }));
  const initialized = await server.reply();
  assert.equal(initialized.id, 0);
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  server.send({ jsonrpc: '2.0', method: 'client/unknown-notification' });
  server.send(request(2, 'tools/list'));
  const tools = await server.reply();
  assert.equal(tools.id, 2);
  assert.deepEqual(tools.result.tools.map(tool => tool.name), ['search_packages', 'get_package_details']);
  assert.deepEqual(tools.result.tools[0].inputSchema.properties.detail.enum, ['compact', 'full']);
  server.send(request(3, 'tools/call', { name: 'search_packages', arguments: { keywords: [] } }));
  const invalid = await server.reply();
  assert.equal(invalid.id, 3);
  assert.equal(invalid.result.isError, true);
  server.send('{"jsonrpc":"2.0","id":"split-');
  server.send('✓","method":"ping"}\n');
  assert.deepEqual(await server.reply(), { jsonrpc: '2.0', id: 'split-✓', result: {} });
});

test('stdio answers malformed and oversized messages and continues serving', { timeout: 10000 }, async t => {
  const server = await launch(t);
  server.send('\nnot-json\n');
  assert.equal((await server.reply()).error.code, -32700);
  server.send(JSON.stringify(request(1, 'ping', { oversized: 'a'.repeat(17000) })) + '\n');
  assert.equal((await server.reply()).error.code, -32700);
  server.send(request('after-errors', 'ping'));
  assert.deepEqual(await server.reply(), { jsonrpc: '2.0', id: 'after-errors', result: {} });
});

test('the distributable runs from a path with spaces without dependencies or an automatic npm install', { timeout: 10000 }, async t => {
  const temp = await mkdtemp(join(tmpdir(), 'scout plugin cache '));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const cached = join(temp, 'package-scout');
  await cp(root, cached, { recursive: true });
  for (const name of ['node_modules', 'package.json', 'package-lock.json']) {
    await assert.rejects(access(join(cached, name)), { code: 'ENOENT' });
  }
  const server = await launch(t, cached);
  for (const protocolVersion of ['2026-07-28', '2025-06-18']) {
    server.send(request(protocolVersion, 'initialize', { protocolVersion }));
    const initialized = await server.reply();
    assert.equal(initialized.result.protocolVersion, protocolVersion);
  }
  server.send(request(4, 'tools/list'));
  assert.equal((await server.reply()).result.tools.length, 2);
});

test('the distributable enforces the Node floor that the npm package declares', { timeout: 10000 }, async () => {
  const { engines } = JSON.parse(await readFile(new URL('../npm/package.json', import.meta.url), 'utf8'));
  const floor = engines.node.replace(/^>=/, '');
  const [major, minor] = floor.split('.').map(Number);
  const run = version => spawnSync(process.execPath, [
    '--import', `data:text/javascript,Object.defineProperty(process,'versions',{value:{...process.versions,node:'${version}'}})`,
    join(root, 'server.mjs'),
  ], { cwd: tmpdir(), encoding: 'utf8', input: JSON.stringify(request(1, 'ping')) + '\n', timeout: 5000 });
  const below = run(minor ? `${major}.${minor - 1}.0` : `${major - 1}.99.0`);
  assert.equal(below.status, 1);
  assert.match(below.stderr, new RegExp(`requires Node\\.js ${floor.replaceAll('.', '\\.')} or newer`));
  const at = run(floor);
  assert.equal(at.status, 0, at.stderr);
  assert.deepEqual(JSON.parse(at.stdout), { jsonrpc: '2.0', id: 1, result: {} });
});
