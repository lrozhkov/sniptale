import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { promisify } from 'node:util';

type Fault = {
  method: 'PUT' | 'GET' | 'PROPFIND';
  key: string;
  kind: 'status' | 'redirect' | 'lost-response' | 'hold';
  status?: number;
  repeat?: boolean;
};

/** Terminates test TLS and injects one controlled fault over an existing loopback DAV lab. */
export async function startWebdavLabProxy(upstreamRoot: string) {
  const upstream = new URL(upstreamRoot);
  if (
    upstream.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]', 'localhost'].includes(upstream.hostname) ||
    upstream.username ||
    upstream.password ||
    upstream.search ||
    upstream.hash ||
    !upstream.pathname.endsWith('/') ||
    upstream.pathname === '/'
  )
    throw new Error('Invalid loopback DAV lab root.');

  const directory = await mkdtemp(join(tmpdir(), 'sniptale-dav-proxy-'));
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');
  try {
    await promisify(execFile)('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ]);
  } catch {
    await rm(directory, { recursive: true, force: true });
    throw new Error('DAV lab TLS setup failed.');
  }

  const counts = {
    puts: 0,
    gets: 0,
    propfinds: 0,
    sinkBytes: 0,
    putBodies: [] as { key: string; bytes: number; sha256: string; complete: boolean }[],
  };
  const sockets = new Set<Duplex>();
  const requests = new Set<http.ClientRequest>();
  let armed: Fault | undefined;
  let reached: (() => void) | undefined;
  let faultWait = Promise.resolve();
  let release: (() => void) | undefined;
  let closed = false;
  const markReached = () => {
    reached?.();
    reached = undefined;
  };
  const server = https.createServer(
    {
      key: await readFile(keyPath),
      cert: await readFile(certPath),
    },
    (incoming, downstream) => {
      const rawPath = incoming.url ?? '';
      if (rawPath === '/__dav_redirect_sink') {
        incoming.on('data', (chunk: Buffer) => {
          counts.sinkBytes += chunk.length;
        });
        incoming.on('end', () => {
          downstream.writeHead(204).end();
        });
        return;
      }
      // Admit only direct children of the selected lab root, including nested object keys.
      let key: string;
      try {
        if (!rawPath.startsWith(upstream.pathname) || /[?#]/u.test(rawPath))
          throw new Error('Invalid DAV lab request path.');
        const parts = rawPath.slice(upstream.pathname.length).split('/').map(decodeURIComponent);
        if (parts.some((part) => part === '.' || part === '..' || /[\\/\0]/u.test(part)))
          throw new Error('Invalid DAV lab request path.');
        key = parts.join('/');
      } catch {
        downstream.writeHead(404).end();
        incoming.resume();
        return;
      }
      if (incoming.method === 'PUT') {
        counts.puts++;
        const hash = createHash('sha256');
        let bytes = 0;
        let recorded = false;
        const record = (complete: boolean) => {
          if (recorded) return;
          recorded = true;
          counts.putBodies.push({ key, bytes, sha256: hash.digest('hex'), complete });
        };
        incoming.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          hash.update(chunk);
        });
        incoming.once('end', () => {
          record(true);
        });
        incoming.once('aborted', () => {
          record(false);
        });
      }
      if (incoming.method === 'GET') counts.gets++;
      if (incoming.method === 'PROPFIND') counts.propfinds++;
      const fault =
        armed && armed.method === incoming.method && armed.key === key ? armed : undefined;
      if (fault && !fault.repeat) armed = undefined;
      if (fault?.kind === 'status' || fault?.kind === 'redirect') {
        markReached();
        if (fault.kind === 'redirect') {
          downstream.writeHead(307, { location: '/__dav_redirect_sink' }).end();
        } else {
          downstream.writeHead(fault.status ?? 503).end();
        }
        incoming.resume();
        return;
      }
      // Keep duplicate headers and authorization bytes; replace only the HTTP host field.
      const headers: string[] = [];
      for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
        const name = incoming.rawHeaders[i];
        const value = incoming.rawHeaders[i + 1];
        if (name && value !== undefined && name.toLowerCase() !== 'host') headers.push(name, value);
      }
      headers.push('Host', upstream.host);
      const outgoing = http.request({
        hostname: upstream.hostname.replace(/^\[|\]$/gu, ''),
        port: upstream.port || 80,
        method: incoming.method,
        path: rawPath,
        headers,
      });
      requests.add(outgoing);
      outgoing.on('close', () => {
        requests.delete(outgoing);
      });
      const cancel = () => {
        outgoing.destroy();
        if (release === releaseHeld) release = undefined;
        incoming.destroy();
      };
      const releaseHeld = () => {
        if (release === releaseHeld) release = undefined;
        incoming.pipe(outgoing);
      };
      incoming.on('aborted', cancel);
      incoming.on('error', () => {
        outgoing.destroy();
      });
      downstream.on('close', () => {
        if (!downstream.writableFinished) cancel();
      });
      outgoing.on('error', () => {
        if (!downstream.headersSent && !downstream.destroyed) downstream.writeHead(502).end();
        else downstream.destroy();
      });
      outgoing.on('response', (response) => {
        response.on('error', () => {
          downstream.destroy();
        });
        if (fault?.kind === 'lost-response') {
          // The real server must finish its response before the client loses the acknowledgement.
          response.resume();
          response.on('end', () => {
            markReached();
            downstream.destroy();
          });
        } else {
          downstream.writeHead(response.statusCode ?? 502, response.rawHeaders);
          response.pipe(downstream);
        }
      });
      if (fault?.kind === 'hold') {
        // Pause at the first body chunk. Release pipes the remaining body and its end event.
        let receivedBody = false;
        incoming.once('data', (chunk: Buffer) => {
          receivedBody = true;
          incoming.pause();
          outgoing.write(chunk);
          release = releaseHeld;
          markReached();
        });
        incoming.once('end', () => {
          if (!receivedBody) {
            outgoing.end();
            markReached();
          }
        });
      } else incoming.pipe(outgoing);
    }
  );
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch {
    server.close();
    await rm(directory, { recursive: true, force: true });
    throw new Error('DAV lab proxy startup failed.');
  }
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('DAV lab proxy address missing.');
  return {
    rootUrl: `https://127.0.0.1:${address.port}${upstream.pathname}`,
    counts,
    armFault(fault: Fault) {
      if (closed || armed || reached || release)
        throw new Error('DAV lab fault is already active.');
      if (fault.kind === 'lost-response' && fault.method !== 'PUT') {
        throw new Error('Lost-response faults require PUT.');
      }
      if (
        fault.status !== undefined &&
        (!Number.isInteger(fault.status) || fault.status < 400 || fault.status > 599)
      ) {
        throw new Error('DAV lab fault status must be an error status.');
      }
      armed = { ...fault };
      faultWait = new Promise<void>((resolve) => {
        reached = resolve;
      });
    },
    waitForFault() {
      return faultWait;
    },
    releaseFault() {
      armed = undefined;
      release?.();
    },
    async close() {
      if (closed) return;
      closed = true;
      armed = undefined;
      release = undefined;
      markReached();
      const stopped = new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      for (const request of requests) request.destroy();
      for (const socket of sockets) socket.destroy();
      await stopped;
      await rm(directory, { recursive: true, force: true });
    },
  };
}
