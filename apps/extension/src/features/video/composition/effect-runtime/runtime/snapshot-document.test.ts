import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import * as animationTemplate from '@sniptale/runtime-contracts/animation-template';
import { parseEffectRuntimeSnapshotDocument } from './snapshot-document';

const source = readFileSync(
  'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
  'utf8'
);

it('reuses a validated snapshot across frames without repeating the JSON boundary', () => {
  const snapshot = { source };
  const parse = vi.spyOn(animationTemplate, 'parseAnimationTemplateSource');
  const first = parseEffectRuntimeSnapshotDocument(snapshot);
  for (let frame = 0; frame < 60; frame++) {
    expect(parseEffectRuntimeSnapshotDocument(snapshot)).toBe(first);
  }
  expect(parse).toHaveBeenCalledTimes(1);
  parse.mockRestore();
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.animation.layers)).toBe(true);
  expect(() => {
    first.animation.layers.length = 0;
  }).toThrow();
});

it('revalidates changed source, rejects invalid replacement and recovers', () => {
  const snapshot = { source };
  const first = parseEffectRuntimeSnapshotDocument(snapshot);
  snapshot.source = '{}';
  expect(() => parseEffectRuntimeSnapshotDocument(snapshot)).toThrow('invalid');
  snapshot.source = source + '\n';
  expect(parseEffectRuntimeSnapshotDocument(snapshot)).toEqual(first);
  expect(parseEffectRuntimeSnapshotDocument(snapshot)).not.toBe(first);
  expect(parseEffectRuntimeSnapshotDocument({ source })).not.toBe(first);
});
