import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createReviewActionAudioSource } from './action-audio-source';
import { ACTION_SOUND_CATALOG } from '../../features/video/review/action-audio-catalog';

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  vi.stubGlobal('crypto', webcrypto);
  const sample = ACTION_SOUND_CATALOG['key-01-v1'];
  const bytes = readFileSync(new URL('../../../public/' + sample.path, import.meta.url));
  const controller = new AbortController();
  const fetchResource = vi.fn(async () => new Response(bytes));
  const decode = vi.fn(
    async (
      _data: ArrayBuffer,
      _signal: AbortSignal
    ): Promise<{ sampleRate: number; length: number; numberOfChannels: number }> => ({
      sampleRate: sample.sampleRate,
      length: sample.durationFrames,
      numberOfChannels: 1,
    })
  );
  const getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
  const source = createReviewActionAudioSource({
    signal: controller.signal,
    fetch: fetchResource,
    getURL,
    decode,
  });
  return { bytes, controller, fetchResource, decode, getURL, source };
}

it('loads only the fixed catalog URL, verifies bytes and shares one decoded buffer', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.source.read('key-01-v1'), f.source.read('key-01-v1')]);
  expect(a).toBe(b);
  expect(f.fetchResource).toHaveBeenCalledExactlyOnceWith(
    'chrome-extension://test/action-sounds/v1/key-01.wav',
    { signal: expect.any(AbortSignal), credentials: 'omit', redirect: 'error' }
  );
  expect(f.decode).toHaveBeenCalledOnce();
  expect(new Uint8Array(f.decode.mock.calls[0]![0])).toEqual(new Uint8Array(f.bytes));
  await expect(f.source.read('constructor')).rejects.toMatchObject({ reason: 'resource-invalid' });
  await expect(f.source.read('https://outside/sound.wav')).rejects.toMatchObject({
    reason: 'resource-invalid',
  });
  expect(f.getURL).toHaveBeenCalledOnce();
  f.source.dispose();
  await expect(f.source.read('key-01-v1')).rejects.toThrow();
});

it.each(['missing', 'oversized', 'truncated', 'hash', 'frames', 'rate', 'channels'] as const)(
  'rejects %s and does not retain a failed cache entry',
  async (failure) => {
    const f = fixture();
    const valid = { sampleRate: 44100, length: 5689, numberOfChannels: 1 };
    if (failure === 'missing')
      f.fetchResource.mockResolvedValueOnce(new Response(null, { status: 404 }));
    if (failure === 'oversized')
      f.fetchResource.mockResolvedValueOnce(new Response(new Uint8Array(f.bytes.length + 1)));
    if (failure === 'truncated')
      f.fetchResource.mockResolvedValueOnce(new Response(f.bytes.subarray(0, -1)));
    if (failure === 'hash') {
      const changed = new Uint8Array(f.bytes);
      changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
      f.fetchResource.mockResolvedValueOnce(new Response(changed));
    }
    if (failure === 'frames') f.decode.mockResolvedValueOnce({ ...valid, length: 1 });
    if (failure === 'rate') f.decode.mockResolvedValueOnce({ ...valid, sampleRate: 48000 });
    if (failure === 'channels') f.decode.mockResolvedValueOnce({ ...valid, numberOfChannels: 2 });
    await expect(f.source.read('key-01-v1')).rejects.toMatchObject({
      reason: failure === 'missing' ? 'resource-missing' : 'resource-invalid',
    });
    await expect(f.source.read('key-01-v1')).resolves.toEqual(valid);
    expect(f.fetchResource).toHaveBeenCalledTimes(2);
    f.source.dispose();
  }
);

it('bounds streamed bytes independently of Content-Length and cancels rejected bodies', async () => {
  const f = fixture();
  const cancel = vi.fn();
  f.fetchResource.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(f.bytes.length + 1));
        },
        cancel,
      }),
      { headers: { 'Content-Length': String(f.bytes.length) } }
    )
  );
  await expect(f.source.read('key-01-v1')).rejects.toMatchObject({ reason: 'resource-invalid' });
  expect(cancel).toHaveBeenCalledOnce();
  expect(f.decode).not.toHaveBeenCalled();
  f.source.dispose();
});

it('cancels a pending read and rejects late decode after disposal', async () => {
  const f = fixture();
  const cancel = vi.fn();
  f.fetchResource.mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
  const pending = f.source.read('key-01-v1');
  await vi.waitFor(() => expect(f.fetchResource).toHaveBeenCalledOnce());
  f.controller.abort();
  await expect(pending).rejects.toThrow();
  expect(cancel).toHaveBeenCalledOnce();
  expect(f.decode).not.toHaveBeenCalled();
  const late = fixture();
  let release!: () => void;
  late.decode.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { sampleRate: 44100, length: 5689, numberOfChannels: 1 };
  });
  const decoded = late.source.read('key-01-v1');
  await vi.waitFor(() => expect(late.decode).toHaveBeenCalledOnce());
  late.source.dispose();
  release();
  await expect(decoded).rejects.toThrow();
});

it('calls browser fetch without injecting a method receiver', async () => {
  const f = fixture();
  f.fetchResource.mockImplementationOnce(async function (this: unknown) {
    if (this !== undefined) throw new TypeError('Illegal invocation');
    return new Response(f.bytes);
  });
  try {
    await expect(f.source.read('key-01-v1')).resolves.toMatchObject({
      sampleRate: 44100,
      length: 5689,
      numberOfChannels: 1,
    });
    expect(f.decode).toHaveBeenCalledOnce();
  } finally {
    f.source.dispose();
  }
});
