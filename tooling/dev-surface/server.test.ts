import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startSurfaceServer } from './server.mjs';

let root: string;
const servers: Array<{ origin: string; close(): Promise<void> }> = [];
const token = 'surface-test-token-123456789';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sniptale-dev-surface-'));
  await mkdir(join(root, 'build/tooling/test/harness'), { recursive: true });
  await mkdir(join(root, 'build/assets'), { recursive: true });
  await writeFile(
    join(root, 'build/tooling/test/harness/dev-surface.html'),
    '<!doctype html><html><head><script type="module" src="../../../assets/page.js"></script></head></html>'
  );
  await writeFile(join(root, 'build/assets/page.js'), 'export const built = true;');
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await rm(root, { recursive: true, force: true });
});

async function start(extra: Record<string, unknown> = {}) {
  const server = await startSurfaceServer({
    root,
    buildDir: join(root, 'build'),
    mode: 'built',
    port: 0,
    profile: 'library',
    token,
    ...extra,
  });
  servers.push(server);
  return server;
}

function rawStatus(origin: string, path: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = get(origin + path, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
  });
}

it('serves built production routes with stable asset resolution and exact process identity', async () => {
  const server = await start();
  const response = await fetch(server.origin + '/apps/extension/src/gallery/index.html?mode=edit');
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('<base href="/tooling/test/harness/">');
  expect(response.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
  expect(await (await fetch(server.origin + '/assets/page.js')).text()).toContain('built = true');
  const status = await (await fetch(server.origin + '/__dev_surface/status')).json();
  expect(status).toEqual({
    root,
    pid: process.pid,
    mode: 'built',
    port: Number(new URL(server.origin).port),
    token,
    fixtureDigest: null,
  });
});

it('selects profiles from explicit options and production routes without exposing fixture paths', async () => {
  const fixture = join(root, 'project.zip');
  await writeFile(fixture, 'exact fixture bytes');
  const server = await start({
    fixture,
    fixtureDigest: 'a'.repeat(64),
    id: 'chosen-root',
    profile: 'gallery-editor',
  });
  const url =
    server.origin +
    '/__dev_surface/config?page=' +
    encodeURIComponent('/apps/extension/src/gallery/index.html?mode=edit&mediaId=original');
  const config = await (await fetch(url)).json();
  expect(config).toEqual({
    profile: 'gallery-editor',
    id: 'chosen-root',
    locale: 'en',
    theme: 'light',
    fixtureUrl: '/__dev_surface/fixture',
    fixtureDigest: 'a'.repeat(64),
  });
  expect(JSON.stringify(config)).not.toContain(root);
  expect(await (await fetch(server.origin + config.fixtureUrl)).text()).toBe('exact fixture bytes');
  expect((await fetch(server.origin + '/__dev_surface/fixture/other.zip')).status).toBe(404);
  const explicit = await (
    await fetch(server.origin + '/__dev_surface/config?profile=settings')
  ).json();
  expect(explicit.profile).toBe('settings');
  expect(explicit.id).toBeNull();
  expect((await fetch(server.origin + '/__dev_surface/config?profile=unknown')).status).toBe(400);
});

it('refuses traversal, secret paths, source files, and symlinks outside the built root', async () => {
  await writeFile(join(root, 'private.txt'), 'private fixture data');
  await writeFile(join(root, 'build/assets/source.ts'), 'source must not be served');
  await symlink(join(root, 'private.txt'), join(root, 'build/assets/escape.txt'));
  const server = await start();
  for (const path of [
    '/assets/%2e%2e%2f%2e%2e%2fprivate.txt',
    '/.git/config',
    '/.env',
    '/.tmp/private.zip',
    '/assets/source.ts',
    '/assets/escape.txt',
  ])
    expect(await rawStatus(server.origin, path), path).toBe(403);
  expect(
    (
      await fetch(server.origin + '/__dev_surface/status', {
        headers: { Origin: 'https://unrelated.example' },
      })
    ).status
  ).toBe(403);
});

it('requires the owned token and same origin before stopping the server', async () => {
  const server = await start();
  const stop = server.origin + '/__dev_surface/stop';
  expect((await fetch(stop, { method: 'POST' })).status).toBe(403);
  expect(
    (
      await fetch(stop, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: 'https://unrelated.example',
        },
      })
    ).status
  ).toBe(403);
  expect((await fetch(server.origin + '/__dev_surface/status')).status).toBe(200);
  expect(
    (
      await fetch(stop, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: server.origin,
        },
      })
    ).status
  ).toBe(200);
  await vi.waitFor(async () => {
    await expect(fetch(server.origin + '/__dev_surface/status')).rejects.toThrow();
  });
});

it('admits opaque sandbox modules while keeping private fixture endpoints closed', async () => {
  const fixture = join(root, 'project.zip');
  await writeFile(fixture, 'private fixture bytes');
  const server = await start({ fixture, fixtureDigest: 'b'.repeat(64) });
  const module = await fetch(server.origin + '/assets/page.js', { headers: { Origin: 'null' } });
  expect(module.status).toBe(200);
  expect(module.headers.get('access-control-allow-origin')).toBe('null');
  expect(module.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  expect(module.headers.get('vary')).toBe('Origin');
  const ordinary = await fetch(server.origin + '/assets/page.js');
  expect(ordinary.headers.get('access-control-allow-origin')).toBeNull();
  expect(ordinary.headers.get('vary')).toBe('Origin');
  const archive = await fetch(server.origin + '/__dev_surface/fixture', {
    headers: { Origin: 'null' },
  });
  expect(archive.status).toBe(403);
  expect(archive.headers.get('access-control-allow-origin')).toBeNull();
});

it('reports the required build command when the built launcher is absent', async () => {
  await rm(join(root, 'build/tooling/test/harness/dev-surface.html'));
  await expect(start()).rejects.toThrow('npm run qa:e2e:build');
});

it('refuses foreign source access to ordinary archives and JSON before real Vite serves them', async () => {
  await mkdir(join(root, 'tooling/dev-surface'), { recursive: true });
  await mkdir(join(root, 'fixtures'), { recursive: true });
  await writeFile(
    join(root, 'tooling/dev-surface/vite.config.ts'),
    "export default { publicDir: false, server: { cors: { origin: ['null'] } } };"
  );
  const fixture = join(root, 'fixtures/private.zip');
  await writeFile(fixture, 'private archive bytes');
  await writeFile(join(root, 'fixtures/private.json'), '{"private":"project metadata"}');
  const server = await start({ mode: 'source', fixture, fixtureDigest: 'c'.repeat(64) });
  for (const path of [
    '/fixtures/private.zip',
    '/fixtures/private.json',
    '/fixtures/private.json?import',
    '/@fs' + fixture,
  ]) {
    for (const headers of [
      { Origin: 'null' },
      { Origin: 'https://unrelated.example' },
      { 'Sec-Fetch-Site': 'cross-site' },
    ]) {
      const response = await fetch(server.origin + path, { headers });
      expect(response.status, `${path} ${JSON.stringify(headers)}`).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(await response.text()).not.toContain('private archive bytes');
    }
  }
  const local = await fetch(server.origin + '/fixtures/private.json', {
    headers: { Origin: server.origin, 'Sec-Fetch-Site': 'same-origin' },
  });
  expect(local.status).toBe(200);
  expect(await local.text()).toBe('{"private":"project metadata"}');
});
