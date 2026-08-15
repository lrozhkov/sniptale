import { expect, it } from 'vitest';
import { createMockDocument } from './test-fixtures-document';

it('keeps the canonical background blur default in controller document fixtures', () => {
  expect(createMockDocument().frame.backgroundBlurAmount).toBe(0);
});
