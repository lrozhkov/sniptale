import { expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { createDrawingModeController } from './mode';

function createHarness(activationAllowed: boolean) {
  const session = createDrawingSession();
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => [],
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: vi.fn(() => activationAllowed),
    registerInteractionFinalizer: vi.fn(),
  };
  const base = {
    handleClearHighlights: vi.fn(),
    handleEnableCursorMode: vi.fn(() => true),
    handleHideToolbar: vi.fn(),
    handleToggleDesignReviewMode: vi.fn(),
    handleToggleHighlighterMode: vi.fn(),
    handleToggleNavigationLock: vi.fn(),
    handleToggleQuickEditDocumentMode: vi.fn(),
    handleToggleQuickEditMode: vi.fn(),
    handleToggleScreenshotMode: vi.fn(),
  };
  const disableDrawing = vi.fn();
  const onUnavailable = vi.fn();
  const setDrawingMode = vi.fn();
  const setNavigationLockEnabled = vi.fn();
  const mode = createDrawingModeController({
    baseModeController: base,
    controller,
    disableDrawing,
    onUnavailable,
    setDrawingMode,
    setNavigationLockEnabled,
  });
  return {
    base,
    controller,
    disableDrawing,
    mode,
    onUnavailable,
    session,
    setDrawingMode,
    setNavigationLockEnabled,
  };
}

it('fails drawing activation closed when page scroll ownership is ambiguous', () => {
  const harness = createHarness(false);
  harness.mode.handleToggleDrawingMode?.(true);
  expect(harness.onUnavailable).toHaveBeenCalledTimes(1);
  expect(harness.setDrawingMode).not.toHaveBeenCalled();
  expect(harness.base.handleEnableCursorMode).not.toHaveBeenCalled();
});

it('does not enable drawing when sibling-mode cleanup fails', () => {
  const harness = createHarness(true);
  harness.base.handleEnableCursorMode.mockReturnValue(false);
  harness.mode.handleToggleDrawingMode?.(true);
  expect(harness.setDrawingMode).not.toHaveBeenCalled();
  expect(harness.setNavigationLockEnabled).not.toHaveBeenCalledWith(true);
});

it('owns activation, sibling-mode cleanup, and preparation-session reset', () => {
  const harness = createHarness(true);
  harness.mode.handleToggleDrawingMode?.(true);
  expect(harness.base.handleEnableCursorMode).toHaveBeenCalledTimes(1);
  expect(harness.setDrawingMode).toHaveBeenCalledWith(true);
  expect(harness.setNavigationLockEnabled).toHaveBeenCalledWith(false);

  harness.mode.handleToggleHighlighterMode(true);
  expect(harness.disableDrawing).toHaveBeenCalledTimes(1);
  expect(harness.base.handleToggleHighlighterMode).toHaveBeenCalledWith(true);

  const reset = vi.spyOn(harness.session, 'reset');
  harness.mode.handleToggleScreenshotMode(false);
  expect(reset).toHaveBeenCalledTimes(1);
  expect(harness.base.handleToggleScreenshotMode).toHaveBeenCalledWith(false);
});
