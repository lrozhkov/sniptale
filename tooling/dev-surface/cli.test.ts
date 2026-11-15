import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { ChildProcess, spawn } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import {
  compatibleSurfaceServer,
  inspectSurfaceServer,
  parseSurfaceArguments,
  runSurfaceCli,
} from './cli.mjs';
import { SURFACE_PROFILES, getSurfaceProfile, surfaceUrl } from './profiles.mjs';

vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}));

const roots: string[] = [];
function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-surface-cli-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.tmp/dev-surface'), { recursive: true });
  return root;
}
function saveState(root: string, state: { port: number } & Record<string, unknown>) {
  fs.writeFileSync(
    path.join(root, '.tmp/dev-surface', `server-${state.port}.json`),
    JSON.stringify(state)
  );
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it('admits every closed profile and encodes page identity without changing its production route', () => {
  expect(Object.keys(SURFACE_PROFILES)).toHaveLength(10);
  for (const profile of Object.keys(SURFACE_PROFILES)) {
    expect(parseSurfaceArguments([profile]).profile).toBe(profile);
    const url = new URL(surfaceUrl('http://127.0.0.1:4188', { profile, id: 'a?b&c' }));
    expect(url.pathname).toBe(getSurfaceProfile(profile).route);
    expect(url.searchParams.get('id')).toBe('a?b&c');
    expect(url.searchParams.get('profile')).toBe(profile);
  }
});

it.each([
  ['unknown'],
  ['library', '--time', '3'],
  ['popup', '--tool', 'Select'],
  ['settings', '--inspector', 'Background'],
  ['image-editor', '--viewport', '1280x720'],
  ['library', '--port', '0'],
  ['library', '--mode', 'release'],
  ['library', '--fixture'],
  ['library', '--locale', 'xx'],
  ['library', '--theme', 'system'],
  ['library', '--port', '4188', '--port', '4189'],
  ['status', '--fixture', 'x.zip'],
])('refuses unsupported arguments before process or browser work: %j', (...args) => {
  expect(() => parseSurfaceArguments(args)).toThrow();
});

it('compares build and archive identity while permitting explicit page selection on one server', () => {
  const stored = { mode: 'source', fixtureDigest: 'archive', buildDir: undefined };
  expect(compatibleSurfaceServer(stored, { ...stored, profile: 'settings' })).toBe(true);
  expect(compatibleSurfaceServer(stored, { ...stored, fixtureDigest: 'other' })).toBe(false);
  expect(compatibleSurfaceServer(stored, { ...stored, mode: 'built' })).toBe(false);
});

it('treats stale PID state as stopped and never uses it to signal a process', async () => {
  const root = fixtureRoot();
  saveState(root, { port: 4188, pid: process.pid, root, token: 'a'.repeat(64) });
  const request = vi.fn(async () => {
    throw new Error('Connection refused');
  });
  const output: string[] = [];
  await runSurfaceCli(['stop'], { root, request, output: (value) => output.push(value) });
  expect(output).toEqual(['Server is stopped. No process was signalled.']);
  expect(fs.existsSync(path.join(root, '.tmp/dev-surface/server-4188.json'))).toBe(false);
  expect(request).toHaveBeenCalledOnce();
});

it('refuses shutdown when a listening process does not match the stored root and token', async () => {
  const root = fixtureRoot();
  saveState(root, { port: 4188, pid: process.pid, root, token: 'a'.repeat(64) });
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          root,
          port: 4188,
          pid: process.pid,
          token: 'b'.repeat(64),
          mode: 'source',
          fixtureDigest: null,
        })
      )
  );
  expect((await inspectSurfaceServer(root, 4188, request)).status).toBe('foreign');
  await expect(runSurfaceCli(['stop'], { root, request })).rejects.toThrow('unverified process');
  expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenNthCalledWith(
    2,
    'http://127.0.0.1:4188/__dev_surface/status',
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
});

it('reuses a compatible authenticated server without a browser or process launch', async () => {
  const root = fixtureRoot();
  const state = {
    root,
    port: 4188,
    pid: process.pid,
    token: 'a'.repeat(64),
    mode: 'source',
    fixtureDigest: null,
  };
  saveState(root, state);
  const request = vi.fn(async () => new Response(JSON.stringify(state)));
  const output: string[] = [];
  await runSurfaceCli(['settings', '--id', 'retained'], {
    root,
    request,
    output: (value) => output.push(value),
  });
  expect(request).toHaveBeenCalledOnce();
  expect(output[0]).toContain(
    '/apps/extension/src/settings/index.html?profile=settings&id=retained'
  );
  expect(output[1]).toBe(`Worktree: ${root}`);
});

it('refuses an incompatible authenticated server that starts during the initial probe', async () => {
  const root = fixtureRoot();
  const launcher = path.join(root, '.tmp/e2e-builds/test/tooling/test/harness');
  fs.mkdirSync(launcher, { recursive: true });
  fs.writeFileSync(path.join(launcher, 'dev-surface.html'), '<!doctype html>');
  fs.writeFileSync(path.join(root, 'fixture-b.zip'), 'request B fixture bytes');
  const concurrent = {
    root,
    port: 4188,
    pid: process.pid,
    token: 'a'.repeat(64),
    mode: 'source',
    fixtureDigest: 'a'.repeat(64),
  };
  vi.mocked(spawn).mockReturnValueOnce(new ChildProcess());
  let probes = 0;
  const request = vi.fn(async () => {
    if (++probes === 1) {
      saveState(root, concurrent);
      throw new Error('Connection refused');
    }
    return new Response(JSON.stringify(concurrent));
  });
  const output = vi.fn();

  await expect(
    runSurfaceCli(['library', '--mode', 'built', '--fixture', 'fixture-b.zip'], {
      root,
      request,
      output,
    })
  ).rejects.toThrow('Server configuration differs.');
  expect(request).toHaveBeenCalledTimes(2);
  expect(output).not.toHaveBeenCalled();
});

it('refuses a missing built launcher before any network or browser operation', async () => {
  const root = fixtureRoot();
  const request = vi.fn();
  await expect(runSurfaceCli(['library', '--mode', 'built'], { root, request })).rejects.toThrow(
    'qa:e2e:build'
  );
  expect(request).not.toHaveBeenCalled();
});

it('refuses a port blocked by the Node runtime before server startup writes', async () => {
  const root = fixtureRoot();
  await expect(runSurfaceCli(['library', '--port', '4190'], { root })).rejects.toThrow(
    'blocked by this Node runtime'
  );
  expect(fs.readdirSync(path.join(root, '.tmp/dev-surface'))).toEqual([]);
});

it('stops a live authenticated server and removes only its state after HTTP shutdown', async () => {
  const root = fixtureRoot();
  const token = 'a'.repeat(64);
  let port = 0;
  let stopped = false;
  const server = http.createServer((request, response) => {
    if (request.url === '/__dev_surface/status') {
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({ root, pid: process.pid, port, token, mode: 'source', fixtureDigest: null })
      );
    } else if (
      request.url === '/__dev_surface/stop' &&
      request.headers.authorization === `Bearer ${token}`
    ) {
      stopped = true;
      response.end('stopping');
      server.close();
    } else {
      response.writeHead(403);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener.');
  port = address.port;
  saveState(root, { root, port, pid: process.pid, token, mode: 'source', fixtureDigest: null });
  try {
    const output: string[] = [];
    await runSurfaceCli(['stop', '--port', String(port)], {
      root,
      output: (value) => output.push(value),
    });
    expect(stopped).toBe(true);
    expect(output).toEqual(['Server stopped.']);
    expect(fs.existsSync(path.join(root, '.tmp/dev-surface', `server-${port}.json`))).toBe(false);
  } finally {
    server.close();
  }
});
