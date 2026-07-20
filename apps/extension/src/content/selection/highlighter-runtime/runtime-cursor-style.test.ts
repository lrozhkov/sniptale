import { beforeEach, describe, expect, it, vi } from 'vitest';

const cursorStyleOwnerMocks = vi.hoisted(() => {
  const controller = {
    mount: vi.fn(),
    remove: vi.fn(),
  };
  const owner = {
    getOwner: vi.fn(() => controller),
    getOwnerIfCreated: vi.fn(() => controller),
  };

  return {
    controller,
    createHighlighterCursorStyleControllerMock: vi.fn(() => controller),
    createLazyContentDefaultOwnerMock: vi.fn(() => owner),
    owner,
  };
});

vi.mock('../../application/default-owner', () => ({
  createLazyContentDefaultOwner: cursorStyleOwnerMocks.createLazyContentDefaultOwnerMock,
}));

vi.mock('../highlighter-cursor-style/controller', () => ({
  createHighlighterCursorStyleController:
    cursorStyleOwnerMocks.createHighlighterCursorStyleControllerMock,
}));

import { mountHighlighterCursorStyle, removeHighlighterCursorStyle } from './runtime-cursor-style';

beforeEach(() => {
  cursorStyleOwnerMocks.controller.mount.mockClear();
  cursorStyleOwnerMocks.controller.remove.mockClear();
  cursorStyleOwnerMocks.owner.getOwner.mockClear();
  cursorStyleOwnerMocks.owner.getOwnerIfCreated.mockClear();
});

describe('highlighter cursor style runtime helpers', () => {
  it('mounts and removes cursor styles through the lazy owner seam', () => {
    mountHighlighterCursorStyle();
    removeHighlighterCursorStyle();

    expect(cursorStyleOwnerMocks.owner.getOwner).toHaveBeenCalledTimes(1);
    expect(cursorStyleOwnerMocks.owner.getOwnerIfCreated).toHaveBeenCalledTimes(1);
    expect(cursorStyleOwnerMocks.controller.mount).toHaveBeenCalledTimes(1);
    expect(cursorStyleOwnerMocks.controller.remove).toHaveBeenCalledTimes(1);
  });
});
