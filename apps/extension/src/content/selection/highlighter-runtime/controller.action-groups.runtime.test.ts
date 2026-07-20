import { expect, it, vi } from 'vitest';

const runtimeActionMocks = vi.hoisted(() => ({
  createHighlighterRuntimeActionsMock: vi.fn(),
}));

vi.mock('./controller.helpers', () => ({
  createHighlighterRuntimeActions: runtimeActionMocks.createHighlighterRuntimeActionsMock,
  createHighlighterFrameActions: vi.fn(),
  createHighlighterStateActions: vi.fn(),
  resolveHighlighterRuntimeDeps: vi.fn(),
}));

import { createHighlighterControllerRuntimeActionGroup } from './controller.action-groups.runtime';

it('wires runtime actions through the owner runtime seam', () => {
  const runtimeActions = { disableMode: vi.fn(), enableMode: vi.fn() };
  runtimeActionMocks.createHighlighterRuntimeActionsMock.mockReturnValue(runtimeActions);
  const hoverController = { hover: true };
  const runtimeDeps = {
    disableRuntime: vi.fn(),
    enableRuntime: vi.fn(),
    logIframeCount: vi.fn(),
  };
  const state = { isModeEnabled: false };

  const result = createHighlighterControllerRuntimeActionGroup({
    hoverController: hoverController as never,
    runtimeDeps: runtimeDeps as never,
    state: state as never,
  });

  expect(runtimeActionMocks.createHighlighterRuntimeActionsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      disableRuntime: runtimeDeps.disableRuntime,
      enableRuntime: runtimeDeps.enableRuntime,
      hoverController,
      logIframeCount: runtimeDeps.logIframeCount,
      state,
    })
  );
  expect(result).toBe(runtimeActions);
});
