import { beforeEach, describe, expect, it, vi } from 'vitest';

const modeMocks = vi.hoisted(() => ({
  disableHighlighterRuntimeMock: vi.fn(),
  enableHighlighterRuntimeMock: vi.fn(),
}));

vi.mock('./mode.disable', () => ({
  disableHighlighterRuntime: modeMocks.disableHighlighterRuntimeMock,
}));

vi.mock('./mode.enable', () => ({
  enableHighlighterRuntime: modeMocks.enableHighlighterRuntimeMock,
}));

import { disableHighlighterRuntime, enableHighlighterRuntime } from './mode';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('highlighter mode facade', () => {
  it('delegates enable to the enable lifecycle seam', () => {
    const state = { state: true } as never;
    const hoverController = { hover: true } as never;
    const returnValue = { enabled: true };
    modeMocks.enableHighlighterRuntimeMock.mockReturnValue(returnValue);

    expect(enableHighlighterRuntime(state, hoverController)).toBe(returnValue);
    expect(modeMocks.enableHighlighterRuntimeMock).toHaveBeenCalledWith(state, hoverController);
  });

  it('delegates disable to the disable lifecycle seam', () => {
    const state = { state: true } as never;
    const hoverController = { hover: true } as never;
    const returnValue = { disabled: true };
    modeMocks.disableHighlighterRuntimeMock.mockReturnValue(returnValue);

    expect(disableHighlighterRuntime(state, hoverController)).toBe(returnValue);
    expect(modeMocks.disableHighlighterRuntimeMock).toHaveBeenCalledWith(state, hoverController);
  });
});
