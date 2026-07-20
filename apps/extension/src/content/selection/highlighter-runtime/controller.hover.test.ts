import { expect, it, vi } from 'vitest';

const hoverPreviewMocks = vi.hoisted(() => ({
  createHighlighterHoverControllerMock: vi.fn(),
}));

vi.mock('../highlighter-hover-preview', async (importOriginal) => ({
  ...(await importOriginal()),
  createHighlighterHoverController: hoverPreviewMocks.createHighlighterHoverControllerMock,
}));

import { createHighlighterControllerHoverController } from './controller.hover';
import { createHoverControllerStub } from './controller.test.helpers';
import { createHighlighterRuntimeState } from './state';

it('builds hover controller wiring from runtime callbacks and state getters', () => {
  const state = createHighlighterRuntimeState();
  state.callbacks.addFrame = vi.fn();
  state.callbacks.hasFrameForElement = vi.fn();
  state.isModeEnabled = true;
  state.isPaused = true;
  state.isFrameEditing = true;
  state.isTooltipVisible = true;
  const hoverControllerStub = createHoverControllerStub();
  const createHoverController = vi.fn(() => hoverControllerStub);

  const hoverController = createHighlighterControllerHoverController(
    { createHoverController },
    state
  );

  expect(createHoverController).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({
      isModeEnabled: expect.any(Function),
      isPaused: expect.any(Function),
      isFrameEditing: expect.any(Function),
      isTooltipVisible: expect.any(Function),
    })
  );
  expect(hoverController).toBe(hoverControllerStub);
});

it('falls back to the shared hover-controller factory when no override is injected', () => {
  const state = createHighlighterRuntimeState();
  const hoverControllerStub = createHoverControllerStub();

  hoverPreviewMocks.createHighlighterHoverControllerMock.mockReturnValueOnce(hoverControllerStub);

  const hoverController = createHighlighterControllerHoverController({}, state);

  expect(hoverPreviewMocks.createHighlighterHoverControllerMock).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({
      isModeEnabled: expect.any(Function),
      isPaused: expect.any(Function),
      isFrameEditing: expect.any(Function),
      isTooltipVisible: expect.any(Function),
    })
  );
  expect(hoverController).toBe(hoverControllerStub);
});
