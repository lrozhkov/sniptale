import { expect, it, vi } from 'vitest';

const { initializeBackgroundRuntimeFromOwner } = vi.hoisted(() => ({
  initializeBackgroundRuntimeFromOwner: vi.fn(),
}));

vi.mock('./runtime-wiring/initialize', () => ({
  initializeBackgroundRuntime: initializeBackgroundRuntimeFromOwner,
}));

import { initializeBackgroundRuntime } from './runtime-wiring/initialize';

it('re-exports the runtime-wiring entrypoint from the owner folder without wrapping', () => {
  expect(initializeBackgroundRuntime).toBe(initializeBackgroundRuntimeFromOwner);
});
