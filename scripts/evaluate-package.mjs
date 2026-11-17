import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { appendFile, cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const inside = (root, target) => target === root || target.startsWith(root + path.sep);

export function validateEvaluation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Evaluation must be a JSON object');
  if (!PACKAGE_NAME.test(value.package?.name ?? '')) throw new Error('package.name must be an npm package name');
  if (!EXACT_VERSION.test(value.package?.version ?? '')) throw new Error('package.version must be an exact version, such as 5.7.1');
  if (typeof value.run !== 'string' || !value.run.trim()) throw new Error('run must contain the agent-written evaluation command');
  if (value.setup !== undefined && typeof value.setup !== 'string') throw new Error('setup must be a shell script');
  if (value.install !== undefined && typeof value.install !== 'boolean') throw new Error('install must be a boolean');
  if (value.title !== undefined && typeof value.title !== 'string') throw new Error('title must be a string');
  const image = value.image ?? 'node:24-bookworm';
  if (typeof image !== 'string' || !image || /\s/.test(image) || image.startsWith('-')) throw new Error('image must be a Docker image reference');
  const files = value.files ?? {};
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('files must map relative paths to text content');
  for (const [name, content] of Object.entries(files)) {
    if (!name || name.includes('\\') || name.includes('\0') || path.posix.isAbsolute(name) || name.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error(`File path must stay inside the evaluation workspace: ${JSON.stringify(name)}`);
    }
    if (typeof content !== 'string') throw new Error(`File content must be text: ${JSON.stringify(name)}`);
  }
  const env = value.env ?? {};
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw new Error('env must map environment names to strings');
  for (const [name, content] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || typeof content !== 'string' || content.includes('\0')) throw new Error('env must contain valid environment names and string values');
    if (['EVALUATION_INPUT', 'EVALUATION_RESULTS', 'EVALUATION_ARTIFACTS'].includes(name)) throw new Error(`${name} is supplied by the runner`);
  }
  return { ...value, image, files, env, install: value.install ?? true, setup: value.setup ?? '' };
}

export async function loadEvaluation(source, cwd = process.cwd()) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Supply evaluation JSON or an evaluation JSON file path');
  const text = source.trim().startsWith('{') ? source : await readFile(path.resolve(cwd, source), 'utf8');
  return validateEvaluation(JSON.parse(text));
}

// No shell interprets workflow input on the host. Only /bin/sh inside the
// disposable container executes the intentionally agent-written scripts.
export async function execute(program, args, { log, timeoutMs }) {
  await mkdir(path.dirname(log), { recursive: true });
  const output = createWriteStream(log);
  return await new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
    let timedOut = false;
    let spawnError;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, Math.max(1, timeoutMs));
    child.on('error', (error) => { spawnError = error; });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      output.end(() => {
        if (spawnError) reject(spawnError);
        else resolve({ exit_code: code, signal, timed_out: timedOut });
      });
    });
  });
}

async function readWorkspaceFile(workspace, relative, maxBytes = 2 * 1024 * 1024) {
  const location = path.join(workspace, relative);
  try {
    if (!inside(await realpath(workspace), await realpath(location)) || !(await lstat(location)).isFile()) return null;
    if ((await stat(location)).size > maxBytes) throw new Error(`${relative} is too large to embed in report.json; inspect the artifact instead`);
    return await readFile(location, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function collectEvidence(workspace, output, spec, report) {
  // The container has stopped before collection. Do not follow symlinks into
  // runner files when uploading agent-produced artifacts.
  const filter = async (source) => !(await lstat(source)).isSymbolicLink();
  for (const name of ['results.json', 'package-lock.json', 'npm-shrinkwrap.json', 'artifacts']) {
    const source = path.join(workspace, name);
    try {
      await cp(source, path.join(output, name), { recursive: true, filter });
    } catch (error) {
      if (error.code !== 'ENOENT') report.collection_warnings.push(`${name}: ${error.message}`);
    }
  }
  try {
    const result = await readWorkspaceFile(workspace, 'results.json');
    if (result !== null) report.evaluation_results = JSON.parse(result);
  } catch (error) {
    report.collection_warnings.push(error.message);
  }
  try {
    const manifest = await readWorkspaceFile(workspace, `node_modules/${spec.package.name}/package.json`);
    if (manifest) {
      const observed = JSON.parse(manifest);
      report.installed_package = { name: observed.name ?? null, version: observed.version ?? null };
      if (observed.name !== spec.package.name || observed.version !== spec.package.version) {
        report.collection_warnings.push('Observed installed package differs from the declared package; inspect setup and the lockfile');
      }
    }
  } catch (error) {
    report.collection_warnings.push(`Installed manifest: ${error.message}`);
  }
}

export async function runEvaluation(input, options = {}) {
  const spec = validateEvaluation(input);
  const output = path.resolve(options.output ?? await mkdtemp(path.join(tmpdir(), 'package-evaluation-report-')));
  const scratch = await mkdtemp(path.join(tmpdir(), 'package-evaluation-work-'));
  const workspace = path.join(scratch, 'workspace');
  const control = path.join(scratch, 'control');
  const name = `package-evaluation-${randomUUID()}`;
  const run = options.execute ?? execute;
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 19.5 * 60 * 1000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Execution timeout must be positive');
  const report = {
    schema_version: 1,
    title: spec.title ?? `${spec.package.name}@${spec.package.version}`,
    status: 'failed',
    package: spec.package,
    installed_package: null,
    image: spec.image,
    image_digests: [],
    evaluation_sha256: sha256(JSON.stringify(spec)),
    started_at: new Date(started).toISOString(),
    completed_at: null,
    duration_ms: null,
    stages: [],
    evaluation_results: null,
    collection_warnings: [],
    limitations: [
      'Execution evidence applies only to this script, package version, inputs, and environment.',
      'Agent-produced assertions and results are not an independent security or correctness certification.',
    ],
    source: options.source ?? null,
  };
  await mkdir(output, { recursive: true });
  async function stage(id, args) {
    const log = path.join(output, 'logs', `${id}.log`);
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) throw Object.assign(new Error(`Evaluation timed out before ${id}`), { timedOut: true });
    const stageStarted = Date.now();
    const result = await run('docker', args, { log, timeoutMs: remaining, workspace, control });
    report.stages.push({ name: id, ...result, duration_ms: Date.now() - stageStarted, log: `logs/${id}.log` });
    if (result.timed_out) throw Object.assign(new Error(`Evaluation timed out during ${id}`), { timedOut: true });
    if (result.exit_code !== 0) throw new Error(`${id} exited with code ${result.exit_code}${result.signal ? ` (${result.signal})` : ''}; see logs/${id}.log`);
  }
  try {
    await mkdir(workspace, { recursive: true });
    await mkdir(control, { recursive: true });
    await mkdir(path.join(workspace, 'artifacts'));
    if (!Object.hasOwn(spec.files, 'package.json')) {
      await writeFile(path.join(workspace, 'package.json'), JSON.stringify({ name: 'package-scout-evaluation', version: '1.0.0', private: true, type: 'module' }, null, 2));
    }
    for (const [relative, content] of Object.entries(spec.files)) {
      const destination = path.join(workspace, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
    await writeFile(path.join(control, 'input.json'), JSON.stringify(spec.input ?? null, null, 2));
    const install = `npm install --save-exact --no-audit --no-fund ${shellQuote(`${spec.package.name}@${spec.package.version}`)}`;
    await writeFile(path.join(control, 'install.sh'), `#!/bin/sh\nset -eu\n${install}\n`);
    await writeFile(path.join(control, 'setup.sh'), `#!/bin/sh\nset -eu\n${spec.setup}\n`);
    await writeFile(path.join(control, 'run.sh'), `#!/bin/sh\nset -eu\n${spec.run}\n`);
    await writeFile(path.join(output, 'evaluation.json'), JSON.stringify(spec, null, 2) + '\n');
    await stage('image-pull', ['pull', spec.image]);
    await stage('image-inspect', ['image', 'inspect', spec.image, '--format', '{{json .RepoDigests}}']);
    try {
      report.image_digests = JSON.parse(await readFile(path.join(output, 'logs/image-inspect.log'), 'utf8')) ?? [];
    } catch { report.collection_warnings.push('Could not read the image digest; inspect the image log'); }
    const containerArgs = [
      'create', '--name', name, '--init', '--workdir', '/workspace',
      '--mount', `type=bind,source=${workspace},target=/workspace`,
      '--mount', `type=bind,source=${control},target=/control,readonly`,
      '--env', 'EVALUATION_INPUT=/control/input.json',
      '--env', 'EVALUATION_RESULTS=/workspace/results.json',
      '--env', 'EVALUATION_ARTIFACTS=/workspace/artifacts',
      '--env', 'CI=true',
    ];
    for (const [key, value] of Object.entries(spec.env)) containerArgs.push('--env', `${key}=${value}`);
    containerArgs.push('--entrypoint', '/bin/sh', spec.image, '-c', 'while :; do sleep 3600; done');
    await stage('container-create', containerArgs);
    await stage('container-start', ['start', name]);
    if (spec.install) await stage('install', ['exec', name, '/bin/sh', '/control/install.sh']);
    if (spec.setup.trim()) await stage('setup', ['exec', name, '/bin/sh', '/control/setup.sh']);
    await stage('evaluation', ['exec', name, '/bin/sh', '/control/run.sh']);
    report.status = 'succeeded';
  } catch (error) {
    report.status = error.timedOut ? 'timed_out' : 'failed';
    report.error = error.message;
  } finally {
    try {
      const cleanup = await run('docker', ['rm', '--force', name], { log: path.join(output, 'logs/cleanup.log'), timeoutMs: 15_000, workspace, control });
      if (cleanup.exit_code !== 0 || cleanup.timed_out) report.collection_warnings.push('Container removal did not complete; inspect logs/cleanup.log');
    } catch (error) { report.collection_warnings.push(`Container cleanup: ${error.message}`); }
    await collectEvidence(workspace, output, spec, report);
    report.completed_at = new Date().toISOString();
    report.duration_ms = Date.now() - started;
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await rm(scratch, { recursive: true, force: true }).catch((error) => {
      console.error(`Temporary workspace cleanup: ${error.message}`);
    });
  }
  return { output, report };
}

async function main() {
  const source = process.env.PACKAGE_SCOUT_EVALUATION ?? process.argv[2];
  const minutes = Number(process.env.PACKAGE_SCOUT_TIMEOUT_MINUTES ?? '20');
  const output = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? tmpdir(), 'package-evaluation-report-'));
  let report;
  try {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 360) throw new Error('timeout_minutes must be an integer from 1 to 360');
    const spec = await loadEvaluation(source);
    const sourceInfo = process.env.GITHUB_RUN_ID ? {
      repository: process.env.GITHUB_REPOSITORY,
      commit_sha: process.env.GITHUB_SHA,
      run_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      run_attempt: process.env.GITHUB_RUN_ATTEMPT,
    } : null;
    ({ report } = await runEvaluation(spec, { output, timeoutMs: minutes * 60_000 - 30_000, source: sourceInfo }));
  } catch (error) {
    report = { schema_version: 1, status: 'failed', error: error.message, completed_at: new Date().toISOString() };
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `report_path=${output}\nstatus=${report.status}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const target = report.package ? `${report.package.name}@${report.package.version}` : 'Invalid evaluation request';
    const stages = (report.stages ?? []).map((item) => `| ${item.name} | ${item.timed_out ? 'timed out' : item.exit_code} | ${item.duration_ms} |`).join('\n');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Package evaluation\n\nPackage: ${target}\n\nExecution: **${report.status}**. This describes the submitted test, not general package correctness.\n\n| Stage | Exit code | Duration (ms) |\n| --- | --- | ---: |\n${stages}\n\nDownload the package-evaluation artifact for the exact evaluation, report, logs, lockfile, and agent-produced files.\n`);
  }
  console.log(JSON.stringify({ status: report.status, report_path: output }));
  if (report.status !== 'succeeded') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
