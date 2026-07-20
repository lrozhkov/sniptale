import { expect, it, vi } from 'vitest';

const actionGroupMocks = vi.hoisted(() => ({
  createFrameStateActionGroupMock: vi.fn(),
  createRuntimeActionGroupMock: vi.fn(),
}));

vi.mock('./controller.action-groups.frame-state', () => ({
  createHighlighterControllerFrameStateActionGroup:
    actionGroupMocks.createFrameStateActionGroupMock,
}));

vi.mock('./controller.action-groups.runtime', () => ({
  createHighlighterControllerRuntimeActionGroup: actionGroupMocks.createRuntimeActionGroupMock,
}));

import { createHighlighterControllerActionGroups } from './controller.action-groups';

function createActionGroupInputs() {
  const frameActions = { addHighlight: vi.fn(), clearAllHighlights: vi.fn() };
  const runtimeActions = { disableMode: vi.fn(), enableMode: vi.fn() };
  const stateActions = { pause: vi.fn(), resume: vi.fn() };

  actionGroupMocks.createFrameStateActionGroupMock.mockReturnValue({
    frameActions,
    stateActions,
  });
  actionGroupMocks.createRuntimeActionGroupMock.mockReturnValue(runtimeActions);

  return {
    frameActions,
    runtimeActions,
    stateActions,
  };
}

it('composes runtime and frame/state action groups', () => {
  const { frameActions, runtimeActions, stateActions } = createActionGroupInputs();
  const hoverController = { hover: true };
  const logger = { log: vi.fn(), warn: vi.fn() };
  const runtimeDeps = {
    disableRuntime: vi.fn(),
    enableRuntime: vi.fn(),
    logIframeCount: vi.fn(),
  };
  const state = { isModeEnabled: false };

  const groups = createHighlighterControllerActionGroups({
    hoverController: hoverController as never,
    logger,
    runtimeDeps: runtimeDeps as never,
    state: state as never,
  });

  expect(actionGroupMocks.createRuntimeActionGroupMock).toHaveBeenCalledWith(
    expect.objectContaining({
      hoverController,
      runtimeDeps,
      state,
    })
  );
  expect(actionGroupMocks.createFrameStateActionGroupMock).toHaveBeenCalledWith(
    expect.objectContaining({
      hoverController,
      logger,
      state,
    })
  );
  expect(groups.runtimeActions).toBe(runtimeActions);
  expect(groups.frameActions).toBe(frameActions);
  expect(groups.stateActions).toBe(stateActions);
});
