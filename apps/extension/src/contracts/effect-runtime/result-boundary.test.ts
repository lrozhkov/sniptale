// @vitest-environment jsdom

import { expect, it } from 'vitest';

import { parseEffectRuntimeFrameResult } from './result-boundary';

const identity = {
  effectInstanceId: 'effect-1',
  requestId: 'request-1',
  sequenceId: 1,
  snapshotId: 'snapshot-1',
};

it('accepts an exact cache miss result and rejects extra boundary fields', () => {
  const result = {
    ...identity,
    code: 'cacheMiss',
    kind: 'error',
    missingRef: 'document',
  } as const;

  expect(parseEffectRuntimeFrameResult(result)).toEqual(result);
  expect(parseEffectRuntimeFrameResult({ ...result, source: '{}' })).toBeNull();
});

it('requires exact immutable-ref acknowledgements on successful frames', () => {
  const bitmap = { close() {}, height: 20, width: 20 } as ImageBitmap;
  const result = {
    ...identity,
    acknowledged: {
      assetSelectionId: 'b'.repeat(64),
      documentId: 'a'.repeat(64),
    },
    bitmap,
    height: 20,
    kind: 'frame',
    width: 20,
  } as const;

  expect(parseEffectRuntimeFrameResult(result)).toEqual(result);
  expect(parseEffectRuntimeFrameResult({ ...result, acknowledged: undefined })).toBeNull();
  expect(
    parseEffectRuntimeFrameResult({
      ...result,
      acknowledged: { ...result.acknowledged, unexpected: true },
    })
  ).toBeNull();
});
