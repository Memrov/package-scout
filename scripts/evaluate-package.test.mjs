import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execute, loadEvaluation, runEvaluation, validateEvaluation } from './evaluate-package.mjs';

const base = () => ({ package: { name: '@example/package', version: '1.2.3' }, files: { 'evaluate.mjs': 'console.log("ok")' }, run: 'node evaluate.mjs' });

test('the agent can supply custom runtimes, environment, install steps, and arbitrary scripts', () => {
  const spec = validateEvaluation({ ...base(), image: 'custom/browser@sha256:abc', install: false, setup: 'apt-get update\npython3 prepare.py', run: 'node server.mjs &\npython3 assert_api.py', env: { FEATURE: 'enabled' } });
  assert.equal(spec.install, false);
  assert.match(spec.setup, /apt-get/);
  assert.match(spec.run, /assert_api/);
  assert.equal(spec.env.FEATURE, 'enabled');
});

test('package identities are exact and workspace files cannot escape to the host', () => {
  for (const version of ['latest', '^1.0.0', '1.2.3; touch /tmp/injected']) {
    assert.throws(() => validateEvaluation({ ...base(), package: { name: 'example', version } }), /exact version/);
  }
  for (const file of ['../escape', '/tmp/escape', 'nested/../../escape', 'nested\\escape']) {
    assert.throws(() => validateEvaluation({ ...base(), files: { [file]: 'anything' } }), /workspace/);
  }
  assert.throws(() => validateEvaluation({ ...base(), package: { name: '--ignore-scripts', version: '1.0.0' } }), /npm package name/);
  assert.equal(validateEvaluation({ ...base(), package: { name: 'package', version: '2.0.0-beta.1+build.2' } }).package.version, '2.0.0-beta.1+build.2');
});

test('inline JSON and file requests use the same evaluation contract', async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'evaluation-spec-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await writeFile(path.join(folder, 'spec.json'), JSON.stringify(base()));
  assert.deepEqual(await loadEvaluation('spec.json', folder), await loadEvaluation(JSON.stringify(base())));
});

async function harness(t, options = {}) {
  const output = await mkdtemp(path.join(tmpdir(), 'evaluation-test-output-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const calls = [];
  const transport = async (program, args, context) => {
    calls.push({ program, args, context });
    await mkdir(path.dirname(context.log), { recursive: true });
    await writeFile(context.log, args[0] === 'image' ? '["node@sha256:observed"]\n' : 'observed output\n');
    if (args.at(-1) === '/control/run.sh') await options.evaluate?.(context);
    return options.result?.(args) ?? { exit_code: 0, signal: null, timed_out: false };
  };
  const result = await runEvaluation({ ...base(), setup: 'echo custom setup', input: { text: 'a,b' }, ...options.spec }, { output, execute: transport, timeoutMs: 10_000 });
  return { ...result, calls };
}

test('successful evaluation collects real output, manifest, lockfile, and image identity', async (t) => {
  const { output, report, calls } = await harness(t, { evaluate: async ({ workspace, control }) => {
    assert.deepEqual(JSON.parse(await readFile(path.join(control, 'input.json'), 'utf8')), { text: 'a,b' });
    assert.match(await readFile(path.join(control, 'install.sh'), 'utf8'), /'@example\/package@1\.2\.3'/);
    assert.equal(await readFile(path.join(workspace, 'evaluate.mjs'), 'utf8'), 'console.log("ok")');
    await writeFile(path.join(workspace, 'results.json'), JSON.stringify({ actual: ['a', 'b'], assertions: 2 }));
    await writeFile(path.join(workspace, 'package-lock.json'), '{"lockfileVersion":3}');
    await mkdir(path.join(workspace, 'node_modules/@example/package'), { recursive: true });
    await writeFile(path.join(workspace, 'node_modules/@example/package/package.json'), JSON.stringify({ name: '@example/package', version: '1.2.3' }));
  } });
  assert.equal(report.status, 'succeeded');
  assert.deepEqual(report.evaluation_results, { actual: ['a', 'b'], assertions: 2 });
  assert.deepEqual(report.installed_package, { name: '@example/package', version: '1.2.3' });
  assert.deepEqual(report.image_digests, ['node@sha256:observed']);
  assert.equal(report.evaluation_sha256.length, 64);
  assert.equal(JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8')).status, 'succeeded');
  assert.equal(calls.at(-1).args[0], 'rm');
  const create = calls.find(({ args }) => args[0] === 'create').args;
  assert.equal(create.includes('--privileged'), false);
  assert.equal(create.some((arg) => arg.includes('docker.sock') || arg.includes('GITHUB_TOKEN')), false);
  assert.ok(create.some((arg) => arg.endsWith('target=/control,readonly')));
});

test('failed assertions retain results and logs and still remove the container', async (t) => {
  const { report, output, calls } = await harness(t, {
    evaluate: ({ workspace }) => writeFile(path.join(workspace, 'results.json'), '{"assertion":"failed","actual":4,"expected":3}'),
    result: (args) => args.at(-1) === '/control/run.sh' ? { exit_code: 1, signal: null, timed_out: false } : undefined,
  });
  assert.equal(report.status, 'failed');
  assert.match(report.error, /evaluation exited with code 1/);
  assert.equal(report.evaluation_results.actual, 4);
  assert.equal(await readFile(path.join(output, 'logs/evaluation.log'), 'utf8'), 'observed output\n');
  assert.equal(calls.at(-1).args[0], 'rm');
});

test('setup failures skip evaluation, and timeouts are distinguishable from assertion failures', async (t) => {
  const failed = await harness(t, { result: (args) => args.at(-1) === '/control/setup.sh' ? { exit_code: 7, signal: null, timed_out: false } : undefined });
  assert.equal(failed.report.status, 'failed');
  assert.match(failed.report.error, /setup exited with code 7/);
  assert.equal(failed.calls.some(({ args }) => args.at(-1) === '/control/run.sh'), false);
  const timeout = await harness(t, { result: (args) => args.at(-1) === '/control/run.sh' ? { exit_code: null, signal: 'SIGKILL', timed_out: true } : undefined });
  assert.equal(timeout.report.status, 'timed_out');
  assert.equal(timeout.calls.at(-1).args[0], 'rm');
});

test('agent artifacts cannot smuggle runner files through symlinks', async (t) => {
  const { report, output } = await harness(t, { evaluate: async ({ workspace }) => {
    await writeFile(path.join(workspace, 'artifacts/actual.txt'), 'observed');
    await symlink('/etc/passwd', path.join(workspace, 'artifacts/host.txt'));
    await symlink('/etc/passwd', path.join(workspace, 'results.json'));
  } });
  assert.equal(report.evaluation_results, null);
  assert.equal(await readFile(path.join(output, 'artifacts/actual.txt'), 'utf8'), 'observed');
  await assert.rejects(readFile(path.join(output, 'artifacts/host.txt')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(output, 'results.json')), { code: 'ENOENT' });
});

test('agent evidence and scratch are untouched while container cleanup is unconfirmed', async (t) => {
  const { report, output, calls } = await harness(t, {
    evaluate: async ({ workspace }) => {
      await writeFile(path.join(workspace, 'results.json'), '{"untrusted":"still writable"}');
      await writeFile(path.join(workspace, 'artifacts/live.txt'), 'still writable');
    },
    result: (args) => args[0] === 'rm' ? { exit_code: 1, signal: null, timed_out: false } : undefined,
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.evaluation_results, null);
  assert.equal(report.installed_package, null);
  assert.match(report.collection_warnings.join(' '), /evidence.*not collected/);
  const workspace = calls.at(-1).context.workspace;
  t.after(() => rm(path.dirname(workspace), { recursive: true, force: true }));
  assert.equal(await readFile(path.join(workspace, 'artifacts/live.txt'), 'utf8'), 'still writable');
  await assert.rejects(readFile(path.join(output, 'results.json')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(output, 'artifacts/live.txt')), { code: 'ENOENT' });
});

test('install can be delegated entirely to agent setup and package mismatches remain visible', async (t) => {
  const { report, calls } = await harness(t, { spec: { install: false }, evaluate: async ({ workspace }) => {
    await mkdir(path.join(workspace, 'node_modules/@example/package'), { recursive: true });
    await writeFile(path.join(workspace, 'node_modules/@example/package/package.json'), '{"name":"@example/package","version":"9.9.9"}');
  } });
  assert.equal(calls.some(({ args }) => args.at(-1) === '/control/install.sh'), false);
  assert.equal(report.installed_package.version, '9.9.9');
  assert.match(report.collection_warnings.join(' '), /differs from the declared/);
});

test('the subprocess executor captures output and stops an actual over-budget process', async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'evaluation-process-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const log = path.join(folder, 'process.log');
  const success = await execute(process.execPath, ['-e', 'console.log("actual stdout"); console.error("actual stderr")'], { log, timeoutMs: 5000 });
  assert.equal(success.exit_code, 0);
  assert.match(await readFile(log, 'utf8'), /actual stdout/);
  assert.match(await readFile(log, 'utf8'), /actual stderr/);
  const timeout = await execute(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { log, timeoutMs: 100 });
  assert.equal(timeout.timed_out, true);
  assert.equal(timeout.signal, 'SIGKILL');
});
