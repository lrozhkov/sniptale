import vm from 'node:vm';

import { afterEach, expect, it, vi } from 'vitest';

import { importFresh } from '../../qa/test-support/test-helpers';

afterEach(() => vi.unstubAllGlobals());

it('installs digest normalization once across repeated isolated setup modules', async () => {
  const digest = vi.fn(
    async (_algorithm: AlgorithmIdentifier, _data: BufferSource) => new ArrayBuffer(0)
  );
  const crypto = { subtle: { digest } };
  vi.stubGlobal('crypto', crypto);
  await importFresh('./vitest.setup.ts', import.meta.url);
  const installed = crypto.subtle.digest;
  await importFresh('./vitest.setup.ts', import.meta.url);
  expect(crypto.subtle.digest).toBe(installed);
  await crypto.subtle.digest('SHA-256', new Uint8Array([1, 2]));
  expect(digest).toHaveBeenCalledOnce();
});

it.each(['new Uint8Array([7, 1, 2, 9]).subarray(1, 3)', 'new Uint8Array([1, 2]).buffer'])(
  'preserves foreign-realm BufferSource bytes for %s',
  async (expression) => {
    const result = new ArrayBuffer(3);
    const digest = vi.fn(async (_algorithm: AlgorithmIdentifier, _data: BufferSource) => result);
    const crypto = { subtle: { digest } };
    vi.stubGlobal('crypto', crypto);
    await importFresh('./vitest.setup.ts', import.meta.url);
    const input = vm.runInNewContext(expression);
    await expect(crypto.subtle.digest('SHA-256', input)).resolves.toBe(result);
    expect(digest).toHaveBeenCalledOnce();
    const [algorithm, bytes] = digest.mock.calls[0]!;
    expect(algorithm).toBe('SHA-256');
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect([...bytes]).toEqual([1, 2]);
  }
);

it('preserves the native digest rejection without replacing its identity', async () => {
  const error = new Error('native failure');
  const crypto = {
    subtle: {
      digest: vi.fn(async (_algorithm: AlgorithmIdentifier, _data: BufferSource) =>
        Promise.reject(error)
      ),
    },
  };
  vi.stubGlobal('crypto', crypto);
  await importFresh('./vitest.setup.ts', import.meta.url);
  await expect(crypto.subtle.digest('SHA-256', new Uint8Array())).rejects.toBe(error);
});
