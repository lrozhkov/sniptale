import { expect, it } from 'vitest';
import { EDITOR_AUTOSAVE_POLICY } from './policy';

it('keeps one immutable product deadline pair for document adapters', () => {
  expect(EDITOR_AUTOSAVE_POLICY).toEqual({ delay: 1_000, maxWait: 5_000 });
  expect(Object.isFrozen(EDITOR_AUTOSAVE_POLICY)).toBe(true);
});
