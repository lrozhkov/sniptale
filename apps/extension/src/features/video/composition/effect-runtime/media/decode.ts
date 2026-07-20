import { assertEffectV1AssetSignature } from '@sniptale/runtime-contracts/effect-v1';

import {
  assertEffectDecodedAudio,
  assertEffectDecodedRaster,
  EFFECT_RUNTIME_RESOURCE_LIMITS,
} from '../runtime/resource-limits';
import {
  inspectEffectRasterHeader,
  type EffectRasterHeader,
  type EffectRasterMimeType,
} from './raster-header';
import { inspectEffectAudioContainer } from './audio-container';

type EffectMediaDecodeErrorCode = 'mediaDecodeFailed' | 'mediaDecodeTimeout';

export class EffectMediaDecodeError extends Error {
  readonly code: EffectMediaDecodeErrorCode;

  constructor(code: EffectMediaDecodeErrorCode) {
    super(`Effect media decode failed: ${code}`);
    this.name = 'EffectMediaDecodeError';
    this.code = code;
  }
}

interface EffectDecodedAudioShape {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
}

let activeBrowserAudioDecodes = 0;

export async function decodeEffectRaster(
  bytes: Uint8Array,
  mimeType: EffectRasterMimeType,
  decode: (blob: Blob) => Promise<ImageBitmap> = createImageBitmap
): Promise<{ bitmap: ImageBitmap; header: EffectRasterHeader }> {
  const header = inspectEffectRasterHeader(bytes, mimeType);
  const bitmap = await executeBoundedDecode(
    () => decode(new Blob([bytes.slice().buffer], { type: mimeType })),
    (lateBitmap) => lateBitmap.close()
  );
  try {
    assertEffectDecodedRaster(bitmap.width, bitmap.height);
  } catch {
    bitmap.close();
    throw new EffectMediaDecodeError('mediaDecodeFailed');
  }
  return { bitmap, header };
}

export function validateDecodedEffectAudio(buffer: EffectDecodedAudioShape): number {
  try {
    return assertEffectDecodedAudio({
      channels: buffer.numberOfChannels,
      frames: buffer.length,
      sampleRate: buffer.sampleRate,
    });
  } catch {
    throw new EffectMediaDecodeError('mediaDecodeFailed');
  }
}

export async function decodeEffectAudio<TBuffer extends EffectDecodedAudioShape>(
  blob: Blob,
  mimeType: string,
  decode: (bytes: ArrayBuffer) => Promise<TBuffer>
): Promise<TBuffer> {
  let bytes: ArrayBuffer;
  try {
    bytes = await blob.arrayBuffer();
  } catch {
    throw new EffectMediaDecodeError('mediaDecodeFailed');
  }
  try {
    assertEffectV1AssetSignature(new Uint8Array(bytes), mimeType, 'effect-audio');
    inspectEffectAudioContainer(new Uint8Array(bytes), mimeType);
  } catch {
    throw new EffectMediaDecodeError('mediaDecodeFailed');
  }
  const browserDecode = startBrowserAudioDecode(() => decode(bytes.slice(0)));
  const buffer = await executeBoundedDecode(
    () => browserDecode,
    () => undefined
  );
  validateDecodedEffectAudio(buffer);
  return buffer;
}

function startBrowserAudioDecode<TBuffer>(decode: () => Promise<TBuffer>): Promise<TBuffer> {
  if (activeBrowserAudioDecodes >= EFFECT_RUNTIME_RESOURCE_LIMITS.maxAudioDecodeConcurrency) {
    return Promise.reject(new EffectMediaDecodeError('mediaDecodeFailed'));
  }
  activeBrowserAudioDecodes += 1;
  return Promise.resolve()
    .then(decode)
    .finally(() => {
      activeBrowserAudioDecodes -= 1;
    });
}

async function executeBoundedDecode<T>(
  execute: () => Promise<T>,
  disposeLateResult: (value: T) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new EffectMediaDecodeError('mediaDecodeTimeout'));
    }, EFFECT_RUNTIME_RESOURCE_LIMITS.mediaDecodeTimeoutMs);
    void execute().then(
      (value) => {
        if (settled) {
          disposeLateResult(value);
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new EffectMediaDecodeError('mediaDecodeFailed'));
      }
    );
  });
}
