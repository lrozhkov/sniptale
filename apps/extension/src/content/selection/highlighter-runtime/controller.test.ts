import { beforeEach, expect, it, vi } from 'vitest';

const hoverPreviewMocks = vi.hoisted(() => ({
  createHighlighterHoverControllerMock: vi.fn(),
  logAccessibleIframeCountMock: vi.fn(),
}));

vi.mock('../highlighter-hover-preview', async (importOriginal) => ({
  ...(await importOriginal()),
  createHighlighterHoverController: hoverPreviewMocks.createHighlighterHoverControllerMock,
  logAccessibleIframeCount: hoverPreviewMocks.logAccessibleIframeCountMock,
}));

import { createHighlighterController } from './controller';
import type { HighlighterControllerDeps } from './controller.types';
import { createHighlighterRuntimeState } from './state';
import { createHoverControllerStub, createLoggerStub } from './controller.test-support';

beforeEach(() => {
  vi.clearAllMocks();
});

it('assembles state, hover, lifecycle, and invalidation owners directly', () => {
  const state = createHighlighterRuntimeState();
  const hoverController = createHoverControllerStub();
  const createState = vi.fn(() => state);
  const createHoverController = vi.fn(() => hoverController);
  const enableRuntime = vi.fn();
  const disableRuntime = vi.fn();
  const logAccessibleIframeCount = vi.fn();
  const controller = createHighlighterController({
    createHoverController,
    createState,
    disableRuntime,
    enableRuntime,
    logAccessibleIframeCount,
    logger: createLoggerStub(),
  });

  controller.enableMode();
  controller.disableMode();
  controller.invalidateFrameCache();

  expect(createState).toHaveBeenCalledTimes(1);
  expect(createHoverController).toHaveBeenCalledTimes(1);
  expect(enableRuntime).toHaveBeenCalledWith(state, hoverController);
  expect(disableRuntime).toHaveBeenCalledWith(state, hoverController);
  expect(logAccessibleIframeCount).toHaveBeenCalledTimes(1);
  expect(hoverController.invalidateFrameCache).toHaveBeenCalledTimes(1);
});

it('gives the hover owner live callback and state accessors', () => {
  const state = createHighlighterRuntimeState();
  const hoverController = createHoverControllerStub();
  type CreateHoverController = NonNullable<HighlighterControllerDeps['createHoverController']>;
  const createHoverController = vi.fn(
    (
      _getCallbacks: Parameters<CreateHoverController>[0],
      _getState: Parameters<CreateHoverController>[1]
    ) => hoverController
  );
  const controller = createHighlighterController({
    createHoverController,
    createState: () => state,
    logger: createLoggerStub(),
  });
  const addFrame = vi.fn();
  const hasFrameForElement = vi.fn();
  const addFreeFrame = vi.fn();

  controller.registerFrameCallbacks(addFrame, addFreeFrame, vi.fn(), vi.fn(), hasFrameForElement);
  state.isModeEnabled = true;
  state.isPaused = true;

  const [getCallbacks, getState] = createHoverController.mock.calls[0] ?? [];
  expect(getCallbacks?.()).toEqual({ addFrame, addFreeFrame, hasFrameForElement });
  expect(getState?.isModeEnabled()).toBe(true);
  expect(getState?.isPaused()).toBe(true);
});

it('falls back to the shared hover-controller factory', () => {
  const hoverController = createHoverControllerStub();
  hoverPreviewMocks.createHighlighterHoverControllerMock.mockReturnValueOnce(hoverController);

  createHighlighterController({ logger: createLoggerStub() });

  expect(hoverPreviewMocks.createHighlighterHoverControllerMock).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({
      isFrameEditing: expect.any(Function),
      isModeEnabled: expect.any(Function),
      isPaused: expect.any(Function),
    })
  );
});
