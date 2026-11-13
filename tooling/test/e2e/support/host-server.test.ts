import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

import { resolveBuiltAssetPath, startHostServer } from './host-server';

it('serves built harness assets from the extension build selected by the E2E runner', () => {
  expect(
    resolveBuiltAssetPath('/tooling/test/harness/popup.html', '/repo', '.tmp/e2e-builds/test')
  ).toBe('/repo/.tmp/e2e-builds/test/tooling/test/harness/popup.html');
});

it('falls back to canonical dist when no isolated E2E build is selected', () => {
  expect(resolveBuiltAssetPath('/popup.html', '/repo')).toBe('/repo/dist/popup.html');
});

it('serves built ECMAScript modules with a JavaScript MIME type', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sniptale-host-module-'));
  vi.stubEnv('SNIPTALE_EXTENSION_BUILD_DIR', directory);
  const host = await startHostServer();
  try {
    await writeFile(join(directory, 'audio-runtime.mjs'), 'export const ready = true;');
    const response = await fetch(`${host.origin}/audio-runtime.mjs`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(await response.text()).toBe('export const ready = true;');
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
