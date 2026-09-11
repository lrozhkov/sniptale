import { closeEffectRuntimeBitmaps, isImageBitmap } from './bitmap-lifetime';
import {
  createEffectRuntimeFailure,
  getEffectRuntimeIdentity,
  hasExactKeys,
  isRecord,
} from './identity';
import type { EffectRuntimeFrameInputs, EffectRuntimeFrameResult } from './types';

/** Only unconsumed, bounded raster inputs may travel back on a reference miss. */
export function parseEffectRuntimeRetryInputs(value: unknown): EffectRuntimeFrameInputs | null {
  if (!isRecord(value) || Object.keys(value).length > 2) return null;
  const inputs: EffectRuntimeFrameInputs = {};
  const seen = new Set<ImageBitmap>();
  for (const [name, input] of Object.entries(value)) {
    if (name !== 'source' && name !== 'from' && name !== 'to') return null;
    if (!isRecord(input) || !hasExactKeys(input, ['bitmap', 'height', 'width'])) return null;
    const bitmap = input['bitmap'];
    if (
      !isImageBitmap(bitmap) ||
      seen.has(bitmap) ||
      bitmap.width * bitmap.height > 3840 * 2160 ||
      input['width'] !== bitmap.width ||
      input['height'] !== bitmap.height
    )
      return null;
    seen.add(bitmap);
    inputs[name] = { bitmap, height: bitmap.height, width: bitmap.width };
  }
  return inputs;
}

export function returnEffectRuntimeRetryInputs(
  request: unknown,
  missingRef: 'assetSelection' | 'document'
): EffectRuntimeFrameResult {
  const inputs = isRecord(request) ? parseEffectRuntimeRetryInputs(request['inputFrames']) : null;
  if (!inputs) {
    closeEffectRuntimeBitmaps(request);
    return createEffectRuntimeFailure(request, 'inputRejected');
  }
  if (isRecord(request)) closeEffectRuntimeBitmaps(request['assetSelectionRef']);
  return {
    ...getEffectRuntimeIdentity(request),
    code: 'cacheMiss',
    kind: 'error',
    missingRef,
    ...(Object.keys(inputs).length ? { retryInputs: inputs } : {}),
  };
}

export function collectEffectRuntimeResultBitmaps(result: EffectRuntimeFrameResult): ImageBitmap[] {
  return result.kind === 'frame'
    ? [result.bitmap]
    : result.code === 'cacheMiss'
      ? Object.values(result.retryInputs ?? {}).map(({ bitmap }) => bitmap)
      : [];
}

export function matchesEffectRuntimeRetryInputs(
  expected: EffectRuntimeFrameInputs,
  result: EffectRuntimeFrameResult
): boolean {
  if (result.kind !== 'error' || result.code !== 'cacheMiss') return true;
  const inputs = result.retryInputs ?? {};
  return (
    Object.keys(inputs).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, frame]) => {
      const input = key === 'source' || key === 'from' || key === 'to' ? inputs[key] : undefined;
      return input?.width === frame.width && input?.height === frame.height;
    })
  );
}
