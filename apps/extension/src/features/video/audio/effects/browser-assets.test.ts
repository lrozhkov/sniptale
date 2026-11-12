import { afterEach, expect, it, vi } from 'vitest';
import { AUDIO_DSP_ASSETS } from './catalog';
import { audioRuntimeAssetUrl, readAudioRuntimeAsset } from './browser-assets';
afterEach(() => vi.unstubAllGlobals());
it('resolves every generated binary and the fixed Worklet directly from the application origin', () => {
  for (const asset of AUDIO_DSP_ASSETS.files.filter((asset) => asset.path.endsWith('.wasm'))) {
    const url = audioRuntimeAssetUrl(asset.path);
    expect(url.pathname).toBe('/' + asset.path);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  }
  expect(audioRuntimeAssetUrl('audio-effects/worklet.mjs').pathname).toBe(
    '/audio-effects/worklet.mjs'
  );
  for (const path of [
    'https://example.com/code.wasm',
    '../secret',
    'audio-effects/../secret',
    'audio-effects/custom.wasm',
  ])
    expect(() => audioRuntimeAssetUrl(path)).toThrow('unavailable');
});
it('refuses failed, oversized and cancelled local asset responses before publication', async () => {
  const asset = AUDIO_DSP_ASSETS.files.find((asset) => asset.path.endsWith('/eq.wasm'))!;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 404 }))
  );
  await expect(readAudioRuntimeAsset(asset, new AbortController().signal)).rejects.toThrow(
    'unavailable'
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array(asset.byteLength + 1)))
  );
  await expect(readAudioRuntimeAsset(asset, new AbortController().signal)).rejects.toThrow(
    'size differs'
  );
  const controller = new AbortController();
  controller.abort();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(readAudioRuntimeAsset(asset, controller.signal)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
