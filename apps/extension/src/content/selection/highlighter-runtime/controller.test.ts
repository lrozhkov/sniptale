import { beforeEach, describe, expect, it, vi } from 'vitest';

const controllerBindingsMocks = vi.hoisted(() => ({
  createHighlighterControllerBindingsMock: vi.fn(),
}));

vi.mock('./controller.bindings', () => ({
  createHighlighterControllerBindings:
    controllerBindingsMocks.createHighlighterControllerBindingsMock,
}));

import { createHighlighterController } from './controller';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('highlighter controller facade', () => {
  it('delegates controller construction to the owner-local binding seam', () => {
    const bindings = { controller: true };
    controllerBindingsMocks.createHighlighterControllerBindingsMock.mockReturnValue(bindings);

    expect(createHighlighterController()).toBe(bindings);
    expect(controllerBindingsMocks.createHighlighterControllerBindingsMock).toHaveBeenCalledWith(
      {}
    );
  });
});
