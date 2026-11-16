import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import worker from '../worker/index.ts';

const port = Number(process.env.PORT ?? 8787);
const server = createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
      method: incoming.method,
      headers: Object.entries(incoming.headers).flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(', ') : value]]),
      ...(!['GET', 'HEAD'].includes(incoming.method ?? 'GET') ? { body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>, duplex: 'half' } : {}),
    });
    const response = await worker.fetch(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Preview request failed'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Package Scout preview: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
