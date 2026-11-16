import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: 'dist/server/index.js', minify: true });
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log('Built Package Scout Worker');
