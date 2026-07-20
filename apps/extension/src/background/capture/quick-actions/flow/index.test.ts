import { expect, it, vi } from 'vitest';

const { processQuickActionFromOwner } = vi.hoisted(() => ({
  processQuickActionFromOwner: vi.fn(),
}));

vi.mock('./process', () => ({
  processQuickAction: processQuickActionFromOwner,
}));

import { processQuickAction } from './index';

it('re-exports processQuickAction from the owner folder without wrapping', () => {
  expect(processQuickAction).toBe(processQuickActionFromOwner);
});
