import { expect, it, vi } from 'vitest';

const { handleTabCloseFromOwner, handleTabUpdatedFromOwner } = vi.hoisted(() => ({
  handleTabCloseFromOwner: vi.fn(),
  handleTabUpdatedFromOwner: vi.fn(),
}));

vi.mock('./tab-close', () => ({
  handleTabClose: handleTabCloseFromOwner,
}));

vi.mock('./tab-update', () => ({
  handleTabUpdated: handleTabUpdatedFromOwner,
}));

import { handleTabClose, handleTabUpdated } from './tab-lifecycle';

it('re-exports tab lifecycle seams without wrapping', () => {
  expect(handleTabClose).toBe(handleTabCloseFromOwner);
  expect(handleTabUpdated).toBe(handleTabUpdatedFromOwner);
});
