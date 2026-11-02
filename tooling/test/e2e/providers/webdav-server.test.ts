// @vitest-environment node
import http from 'node:http';
import https from 'node:https';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { startWebdavLabProxy } from './webdav-server';

it('releases every held byte after a single-chunk upstream response ends', async () => {
  const body = 'abcdefghijklmnopqrstuvwx';
  const upstream = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-length': Buffer.byteLength(body), connection: 'close' });
    response.end(body);
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('Test address unavailable');
  const proxy = await startWebdavLabProxy(`http://127.0.0.1:${address.port}/dav/`);
  let request: http.ClientRequest | null = null;
  try {
    proxy.armFault({ method: 'GET', key: 'marker', kind: 'hold-response-body' });
    let received = '';
    let ended = false;
    let responseError = false;
    let firstChunk!: () => void;
    const first = new Promise<void>((resolve) => {
      firstChunk = resolve;
    });
    request = https.get(proxy.rootUrl + 'marker', { rejectUnauthorized: false }, (response) => {
      response.on('data', (chunk: Buffer) => {
        received += chunk.toString();
        firstChunk();
      });
      response.on('end', () => {
        ended = true;
      });
      response.on('error', () => {
        responseError = true;
      });
    });
    request.on('error', () => {
      responseError = true;
    });
    await proxy.waitForFault();
    await first;
    expect(received).toBe(body.slice(0, body.length / 2));
    expect(ended).toBe(false);
    proxy.releaseFault();
    await expect.poll(() => ended, { timeout: 2000 }).toBe(true);
    expect(received).toBe(body);
    expect(responseError).toBe(false);
    expect(proxy.counts.gets).toBe(1);
  } finally {
    request?.destroy();
    await proxy.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

it('counts safe GET response bytes and status without retaining headers or bodies', async () => {
  const body = 'private body must not enter diagnostics';
  const upstream = http.createServer((_request, response) => {
    response.writeHead(404, {
      'content-length': Buffer.byteLength(body),
      'x-private': 'private-header',
    });
    response.end(body);
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('Test address unavailable');
  const proxy = await startWebdavLabProxy(`http://127.0.0.1:${address.port}/dav/`);
  try {
    const result = await new Promise<string>((resolve, reject) => {
      https
        .get(
          proxy.rootUrl + 'missing-object',
          { rejectUnauthorized: false, headers: { authorization: 'Bearer private-test-secret' } },
          (response) => {
            let received = '';
            response.on('data', (chunk: Buffer) => {
              received += chunk.toString();
            });
            response.on('end', () => resolve(received));
            response.on('error', reject);
          }
        )
        .on('error', reject);
    });
    expect(result).toBe(body);
    expect(proxy.counts.getBodies).toEqual([
      {
        key: 'missing-object',
        status: 404,
        receivedBytes: Buffer.byteLength(body),
        forwardedBytes: Buffer.byteLength(body),
        complete: true,
      },
    ]);
    expect(JSON.stringify(proxy.counts)).not.toMatch(/private|authorization|x-private/iu);
  } finally {
    await proxy.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

it('retains incomplete GET byte evidence when the client cancels a streamed response', async () => {
  let finished!: () => void;
  const closed = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const upstream = http.createServer((_request, response) => {
    response.on('close', finished);
    response.writeHead(200, { 'content-length': 8192 });
    response.write(Buffer.alloc(1024, 7));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('Test address unavailable');
  const proxy = await startWebdavLabProxy(`http://127.0.0.1:${address.port}/dav/`);
  try {
    await new Promise<void>((resolve, reject) => {
      const request = https.get(
        proxy.rootUrl + 'streamed-object',
        { rejectUnauthorized: false },
        (response) => {
          response.once('data', () => {
            response.destroy();
            request.destroy();
            resolve();
          });
          response.on('error', () => undefined);
        }
      );
      request.on('error', reject);
    });
    await closed;
    expect(proxy.counts.getBodies).toEqual([
      {
        key: 'streamed-object',
        status: 200,
        receivedBytes: 1024,
        forwardedBytes: 1024,
        complete: false,
      },
    ]);
  } finally {
    await proxy.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
