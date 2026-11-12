import { expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  parseReviewAnnotationEffectSnapshots,
  mergeReviewAnnotationEffectSnapshots,
  verifyReviewAnnotationEffectSnapshot,
} from './validation';

function snapshot(poisoned = false) {
  const source = JSON.stringify({
    format: 'sniptale-animation',
    version: 1,
    id: 'proof',
    label: { en: 'Proof' },
    controls: [],
    bindings: [],
    resources: poisoned
      ? [
          {
            path: 'fonts/proof.ttf',
            fontFamily: 'Proof',
            mimeType: 'font/ttf',
            byteLength: 8,
            base64: 'AAEAAAECAwQ=',
            sha256: '0'.repeat(64),
          },
        ]
      : [],
    animation: { v: '5.12.2', w: 320, h: 180, fr: 30, ip: 30, op: 90, layers: [], assets: [] },
  });
  const hash = bytesToHex(sha256(new TextEncoder().encode(source)));
  return {
    id: `effect:${hash}`,
    schemaVersion: 'sniptale.animation.v1',
    kind: 'standalone',
    documentId: 'proof',
    sha256: hash,
    source,
    retainedByteLength: new TextEncoder().encode(source).byteLength,
    assets: [],
  };
}
it('verifies a self-contained snapshot without external asset reads', async () => {
  const readAsset = vi.fn(),
    input = snapshot(),
    before = structuredClone(input);
  const result = await verifyReviewAnnotationEffectSnapshot(
    input,
    readAsset,
    new AbortController().signal
  );
  expect(result.document.animation.ip).toBe(30);
  expect(result.mode).toBe('object');
  expect(result.assets).toEqual([]);
  expect(readAsset).not.toHaveBeenCalled();
  expect(input).toEqual(before);
});
it('refuses legacy schema, detached assets, retained byte drift and immutable rewrites', () => {
  const input = snapshot();
  for (const patch of [
    { schemaVersion: 'sniptale.effect.v1' },
    { assets: [{}] },
    { retainedByteLength: input.retainedByteLength + 1 },
  ])
    expect(parseReviewAnnotationEffectSnapshots([{ ...input, ...patch }])).toBeNull();
  const parsed = parseReviewAnnotationEffectSnapshots([input])!;
  expect(
    mergeReviewAnnotationEffectSnapshots(parsed, [
      {
        ...parsed[0]!,
        source: `${input.source} `,
        retainedByteLength: input.retainedByteLength + 1,
      },
    ])
  ).toBeNull();
});
it('keeps source and resource integrity failures explicit and honours cancellation', async () => {
  const readAsset = vi.fn(),
    input = snapshot();
  await expect(
    verifyReviewAnnotationEffectSnapshot(
      { ...input, source: `${input.source} `, retainedByteLength: input.retainedByteLength + 1 },
      readAsset,
      new AbortController().signal
    )
  ).rejects.toMatchObject({ code: 'source-integrity' });
  await expect(
    verifyReviewAnnotationEffectSnapshot(snapshot(true), readAsset, new AbortController().signal)
  ).rejects.toMatchObject({ code: 'resource-integrity' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    verifyReviewAnnotationEffectSnapshot(input, readAsset, controller.signal)
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(readAsset).not.toHaveBeenCalled();
});
