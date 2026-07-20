import { beforeEach, describe, expect, it, vi } from 'vitest';

const bindingMocks = vi.hoisted(() => ({
  createHighlighterControllerBindingsMock: vi.fn(),
}));

vi.mock('./controller.assembly', () => ({
  createHighlighterControllerBindings: bindingMocks.createHighlighterControllerBindingsMock,
}));

import { createHighlighterControllerBindings } from './controller.bindings';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('highlighter controller bindings facade', () => {
  it('delegates to the bounded assembly seam', () => {
    const controller = { controller: true };
    bindingMocks.createHighlighterControllerBindingsMock.mockReturnValue(controller);

    expect(createHighlighterControllerBindings()).toBe(controller);
    expect(bindingMocks.createHighlighterControllerBindingsMock).toHaveBeenCalledTimes(1);
  });
});
