import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const check = process.argv.includes('--check');
const sources = new Map([
  ['server.mjs', 'claude-code/server.mjs'],
  ['README.md', 'docs/npm-package.md'],
  ['LICENSE', 'LICENSE'],
]);
await mkdir(new URL('npm/', root), { recursive: true });
for (const [file, source] of sources) {
  const contents = await readFile(new URL(source, root));
  const target = new URL(`npm/${file}`, root);
  if (check) {
    const current = await readFile(target).catch(() => null);
    if (!current || !current.equals(contents)) throw new Error(`${fileURLToPath(target)} is stale. Run npm run npm:build.`);
  } else {
    await writeFile(target, contents);
    await chmod(target, file === 'server.mjs' ? 0o755 : 0o644);
  }
}
if (!check) await chmod(new URL('npm/package.json', root), 0o644);
console.log(check ? 'npm distribution matches its source' : 'Prepared the npm distribution');
