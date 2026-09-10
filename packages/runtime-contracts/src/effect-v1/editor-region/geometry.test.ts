import { expect, it } from 'vitest';
import source from '../fixtures/collection/sniptale-spotlight.sniptale-effect.json';
import { validateEffectV1Document, normalizeEffectV1ToTemplate } from '../index';
import { resolveEffectV1EditorRegion, updateEffectV1EditorRegion } from './geometry';
const document = validateEffectV1Document(source).document!;
it.each([
  { width: 1920, height: 1080 },
  { width: 360, height: 720 },
])('roundtrips logical source geometry at %j', (size) => {
  const rect = resolveEffectV1EditorRegion(document, {}, size)!;
  const patch = updateEffectV1EditorRegion(document, {}, rect, size);
  expect(Object.keys(patch)).toHaveLength(4);
  const actual = resolveEffectV1EditorRegion(document, patch, size)!;
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(actual[key]).toBeCloseTo(rect[key]);
  expect(normalizeEffectV1ToTemplate(document).effectV1).toMatchObject({
    editorRegion: document.editorRegion,
  });
});
it('clamps off-stage gestures and rejects nonfinite geometry', () => {
  const size = { width: 1280, height: 720 };
  const rect = resolveEffectV1EditorRegion(document, {}, size)!;
  const patch = updateEffectV1EditorRegion(document, {}, { ...rect, x: -1000, y: 99999 }, size);
  const bounded = resolveEffectV1EditorRegion(document, patch, size)!;
  expect(bounded.x).toBeGreaterThanOrEqual(0);
  expect(bounded.y + bounded.height).toBeLessThanOrEqual(size.height);
  expect(() => updateEffectV1EditorRegion(document, {}, { ...rect, width: NaN }, size)).toThrow();
});
it('rejects malformed region objects and unknown binding identifiers', () => {
  for (const editorRegion of [
    null,
    [],
    { ...document.editorRegion, xControl: '' },
    { ...document.editorRegion, extra: true },
    { ...document.editorRegion, xControl: 'missing' },
  ]) {
    expect(validateEffectV1Document({ ...document, editorRegion }).ok).toBe(false);
  }
});
