import { expect, it } from 'vitest';

import { createDefaultCaptureMetadata } from './metadata';

it('creates fallback recorder metadata for missing capture payload fields', () => {
  expect(createDefaultCaptureMetadata()).toEqual({
    pointerRange: null,
    scroll: null,
    trigger: 'pointer-up',
  });
});
