#!/usr/bin/env node
import { once } from 'node:events';
import { createInterface } from 'node:readline';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 3)) {
  console.error('Package Scout requires Node.js 24.3.0 or newer.');
  process.exit(1);
}

// The repository is the plugin bundle. Native type stripping runs the same
// handler as the hosted Site, without a build, dependencies or a listening port.
const { default: worker } = await import('../worker/index.ts');
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  // MCP notifications (including unknown methods) never have a response.
  try {
    const message = JSON.parse(line);
    if (message?.jsonrpc === '2.0' && typeof message.method === 'string' && !Object.hasOwn(message, 'id')) continue;
  } catch { /* The shared handler produces the JSON-RPC parse error. */ }
  const response = await worker.fetch(new Request('http://package-scout.local/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: line,
  }));
  const output = await response.text();
  if (output && !process.stdout.write(output + '\n')) await once(process.stdout, 'drain');
}
