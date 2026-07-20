import { expect, it, vi } from 'vitest';
import { createHighlighterRuntimeState } from './state';
import { createHighlighterControllerState } from './controller.state';

it('creates a fresh runtime state when no override is provided', () => {
  const state = createHighlighterControllerState();

  expect(state).toEqual(expect.objectContaining(createHighlighterRuntimeState()));
});

it('uses the injected state factory when provided', () => {
  const state = { isModeEnabled: true };
  const createState = vi.fn(() => state as never);

  expect(createHighlighterControllerState({ createState })).toBe(state);
  expect(createState).toHaveBeenCalledTimes(1);
});
