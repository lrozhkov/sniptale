import { expect, it } from 'vitest';
import { createStableCustomShapeId } from './ids';

it('creates deterministic custom shape ids with slug and fallback labels', () => {
  expect(createStableCustomShapeId('Badge.svg', 'Badge', '<svg/>')).toMatch(/^custom-badge-/);
  expect(createStableCustomShapeId('', '', 'payload')).toMatch(/^custom-custom-shape-/);
});
