import { AUDIO_DSP_ASSETS } from './catalog';
import type { AudioDspPreparation } from './assets';

/** Generated runtime files are served by the build owner, not Vite's source asset graph. */
export function audioRuntimeAssetUrl(path: string): URL {
  if (
    path !== 'audio-effects/worklet.mjs' &&
    !AUDIO_DSP_ASSETS.files.some((asset) => asset.path === path)
  )
    throw new Error('Fixed audio asset is unavailable.');
  // A two-argument new URL with a dynamic path becomes a Vite glob over repository files.
  const url = new URL(import.meta.url);
  url.pathname = '/' + path;
  url.search = '';
  url.hash = '';
  return url;
}

/** Callers can select only catalog-owned bytes. The shared loader verifies SHA256 before compilation. */
export async function readAudioRuntimeAsset(
  asset: Parameters<AudioDspPreparation['readAsset']>[0],
  signal: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> {
  signal.throwIfAborted();
  const response = await fetch(audioRuntimeAssetUrl(asset.path), { signal });
  if (!response.ok) throw new Error('Fixed audio asset is unavailable.');
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  if (bytes.byteLength !== asset.byteLength) throw new Error('Fixed audio asset size differs.');
  return new Uint8Array(bytes);
}
