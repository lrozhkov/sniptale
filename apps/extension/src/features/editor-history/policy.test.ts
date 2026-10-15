import { expect, it } from 'vitest';
import { EDITOR_HISTORY_LIMITS, SCENARIO_SAVED_VERSION_LIMITS } from './policy';

it('keeps reversible edits and previous saved versions under independent product budgets', () => {
  expect(EDITOR_HISTORY_LIMITS).toEqual({ maxActions: 50, maxBytes: 8 * 1024 * 1024 });
  expect(SCENARIO_SAVED_VERSION_LIMITS).toEqual({ maxActions: 20, maxBytes: 16 * 1024 * 1024 });
  expect(Object.isFrozen(EDITOR_HISTORY_LIMITS)).toBe(true);
  expect(Object.isFrozen(SCENARIO_SAVED_VERSION_LIMITS)).toBe(true);
});
