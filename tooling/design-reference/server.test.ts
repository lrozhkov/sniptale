import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesignReferenceServer } from './server.mjs';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'design-reference-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'tooling/design-reference'), { recursive: true });
  await mkdir(join(root, 'docs/design'), { recursive: true });
  await writeFile(join(root, 'tooling/design-reference/index.html'), '<h1>Reference</h1>');
  await writeFile(join(root, 'docs/design/index.md'), '# Rules');
  await writeFile(join(root, 'secret.txt'), 'private');
  const server = createDesignReferenceServer({ root });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  cleanups.push(
    () =>
      new Promise<void>((done, reject) => server.close((error) => (error ? reject(error) : done())))
  );
  const port = (server.address() as AddressInfo).port;
  return { root, port };
}

function get(port: number, path: string, method = 'GET') {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>(
    (done, reject) => {
      const req = request({ host: '127.0.0.1', port, path, method }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (part: string) => (body += part));
        response.on('end', () =>
          done({ status: response.statusCode!, headers: response.headers, body })
        );
      });
      req.on('error', reject);
      req.end();
    }
  );
}

describe('design reference server boundary', () => {
  it('serves the reference and canonical documents without stale responses', async () => {
    const { root, port } = await fixture();
    expect((await get(port, '/')).headers.location).toBe('/tooling/design-reference/');
    const page = await get(port, '/tooling/design-reference/');
    expect(page.status).toBe(200);
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.headers['content-type']).toContain('text/html');
    expect((await get(port, '/docs/design/index.md')).body).toBe('# Rules');
    await writeFile(join(root, 'docs/design/index.md'), '# Updated rules');
    expect((await get(port, '/docs/design/index.md')).body).toBe('# Updated rules');
    const head = await get(port, '/docs/design/index.md', 'HEAD');
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect((await get(port, '/docs/design/index.md', 'POST')).status).toBe(405);
  });

  it('rejects unrelated files, encoded traversal, invalid paths, and symlink escapes', async () => {
    const { root, port } = await fixture();
    await symlink(join(root, 'secret.txt'), join(root, 'tooling/design-reference/leak.txt'));
    for (const path of [
      '/secret.txt',
      '/tooling/design-reference/leak.txt',
      '/tooling/design-reference/server.mjs',
      '/docs/design/missing.md',
      '/tooling/design-reference/../../secret.txt',
    ]) {
      expect((await get(port, path)).status, path).toBe(404);
    }
    for (const path of [
      '/tooling/design-reference/%2e%2e%2fsecret.txt',
      '/docs/design/%00.md',
      '/docs/design/%zz.md',
      '/docs/design/%5csecret.md',
    ]) {
      expect((await get(port, path)).status, path).toBe(400);
    }
  });
});
