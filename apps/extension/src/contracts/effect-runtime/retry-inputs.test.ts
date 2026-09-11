import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  collectEffectRuntimeResultBitmaps,
  matchesEffectRuntimeRetryInputs,
  parseEffectRuntimeRetryInputs,
  returnEffectRuntimeRetryInputs,
} from './retry-inputs';
import { parseEffectRuntimeFrameResult } from './result-boundary';

class Bitmap {
  close = vi.fn();
  constructor(
    readonly width = 16,
    readonly height = 12
  ) {}
}
const identity = {
  effectInstanceId: 'effect',
  requestId: 'request',
  sequenceId: 0,
  snapshotId: 'snapshot',
};
function frame(bitmap = new Bitmap()) {
  return { bitmap, width: bitmap.width, height: bitmap.height };
}
beforeEach(() => vi.stubGlobal('ImageBitmap', Bitmap));
afterEach(() => vi.unstubAllGlobals());

it('returns exact unconsumed input ownership and parses the result on both boundaries', () => {
  const source = frame();
  const request = { ...identity, inputFrames: { source } };
  const result = returnEffectRuntimeRetryInputs(request, 'document');
  expect(parseEffectRuntimeFrameResult(result)).toEqual(result);
  expect(collectEffectRuntimeResultBitmaps(result)).toEqual([source.bitmap]);
  expect(matchesEffectRuntimeRetryInputs(request.inputFrames, result)).toBe(true);
  expect(source.bitmap.close).not.toHaveBeenCalled();
  expect(matchesEffectRuntimeRetryInputs({}, result)).toBe(false);
  expect(matchesEffectRuntimeRetryInputs({ source: frame(new Bitmap(10, 10)) }, result)).toBe(
    false
  );
});

it('rejects malformed, duplicate, excessive and mis-sized returned inputs', () => {
  const source = frame();
  for (const value of [
    null,
    [],
    { wrong: source },
    { source: { ...source, width: 2 } },
    { source, from: source },
    { source: frame(), from: frame(), to: frame() },
    { source: frame(new Bitmap(4096, 4096)) },
    { source: { ...source, extra: true } },
  ]) {
    expect(parseEffectRuntimeRetryInputs(value)).toBeNull();
  }
  const result = {
    ...identity,
    kind: 'error',
    code: 'cacheMiss',
    missingRef: 'document',
    retryInputs: { source: { ...source, height: 1 } },
  };
  expect(parseEffectRuntimeFrameResult(result)).toBeNull();
});

it('releases rejected inputs and supplied assets without closing valid retry inputs', () => {
  const source = frame();
  const asset = frame();
  const result = returnEffectRuntimeRetryInputs(
    { ...identity, inputFrames: { source }, assetSelectionRef: { assets: [asset] } },
    'assetSelection'
  );
  expect(result).toMatchObject({ code: 'cacheMiss' });
  expect(source.bitmap.close).not.toHaveBeenCalled();
  expect(asset.bitmap.close).toHaveBeenCalledOnce();
  expect(
    returnEffectRuntimeRetryInputs({ ...identity, inputFrames: { wrong: source } }, 'document')
  ).toMatchObject({ code: 'inputRejected' });
  expect(source.bitmap.close).toHaveBeenCalledOnce();
  expect(returnEffectRuntimeRetryInputs(null, 'document')).toMatchObject({ code: 'inputRejected' });
});

it('handles reference misses without raster inputs and ordinary results', () => {
  const miss = returnEffectRuntimeRetryInputs({ ...identity, inputFrames: {} }, 'document');
  expect(miss).not.toHaveProperty('retryInputs');
  expect(parseEffectRuntimeFrameResult(miss)).toEqual(miss);
  expect(collectEffectRuntimeResultBitmaps(miss)).toEqual([]);
  const failure = { ...identity, kind: 'error' as const, code: 'crashed' as const };
  expect(collectEffectRuntimeResultBitmaps(failure)).toEqual([]);
  expect(matchesEffectRuntimeRetryInputs({}, failure)).toBe(true);
  const bitmap = new Bitmap();
  expect(
    collectEffectRuntimeResultBitmaps({
      ...identity,
      kind: 'frame',
      bitmap,
      width: 16,
      height: 12,
      acknowledged: { documentId: 'a'.repeat(64), assetSelectionId: 'b'.repeat(64) },
    })
  ).toEqual([bitmap]);
});
