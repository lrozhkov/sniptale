import { expect, it, vi } from 'vitest';

const frameStateActionMocks = vi.hoisted(() => ({
  createHighlighterFrameActionsMock: vi.fn(),
  createHighlighterStateActionsMock: vi.fn(),
}));

vi.mock('./controller.helpers', () => ({
  createHighlighterRuntimeActions: vi.fn(),
  createHighlighterFrameActions: frameStateActionMocks.createHighlighterFrameActionsMock,
  createHighlighterStateActions: frameStateActionMocks.createHighlighterStateActionsMock,
  resolveHighlighterRuntimeDeps: vi.fn(),
}));

import { createHighlighterControllerFrameStateActionGroup } from './controller.action-groups.frame-state';

it('wires frame and state actions through the owner frame/state seam', () => {
  const frameActions = { addHighlight: vi.fn(), clearAllHighlights: vi.fn() };
  const stateActions = { pause: vi.fn(), resume: vi.fn() };
  frameStateActionMocks.createHighlighterFrameActionsMock.mockReturnValue(frameActions);
  frameStateActionMocks.createHighlighterStateActionsMock.mockReturnValue(stateActions);
  const hoverController = { hover: true };
  const logger = { log: vi.fn(), warn: vi.fn() };
  const state = { isModeEnabled: false };

  const result = createHighlighterControllerFrameStateActionGroup({
    hoverController: hoverController as never,
    logger,
    state: state as never,
  });

  expect(frameStateActionMocks.createHighlighterFrameActionsMock).toHaveBeenCalledWith(
    expect.objectContaining({ hoverController, logger, state })
  );
  expect(frameStateActionMocks.createHighlighterStateActionsMock).toHaveBeenCalledWith(
    expect.objectContaining({ hoverController, logger, state })
  );
  expect(result.frameActions).toBe(frameActions);
  expect(result.stateActions).toBe(stateActions);
});
