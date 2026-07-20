import { expect, it, vi } from 'vitest';

const { handleTabUpdatedFromOwner } = vi.hoisted(() => ({
  handleTabUpdatedFromOwner: vi.fn(),
}));

vi.mock('./tab-update/route', () => ({
  handleTabUpdated: handleTabUpdatedFromOwner,
}));

import { handleTabUpdated } from './tab-update';

it('re-exports the tab-update route without wrapping', () => {
  expect(handleTabUpdated).toBe(handleTabUpdatedFromOwner);
});
