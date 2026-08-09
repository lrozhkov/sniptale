import { expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { createDrawingModeController } from './mode';

function createHarness(activationAllowed: boolean) {
  const session = createDrawingSession({ onDocumentCommit: () => true });
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

it('owns activation and sibling-mode cleanup without discarding shared-history state', () => {
  const harness = createHarness(true);
  harness.mode.handleToggleDrawingMode?.(true);
  expect(harness.base.handleEnableCursorMode).toHaveBeenCalledTimes(1);
  expect(harness.setDrawingMode).toHaveBeenCalledWith(true);
  expect(harness.setNavigationLockEnabled).toHaveBeenCalledWith(false);

  harness.mode.handleToggleHighlighterMode(true);
  expect(harness.disableDrawing).toHaveBeenCalledTimes(1);
  expect(harness.base.handleToggleHighlighterMode).toHaveBeenCalledWith(true);

  harness.session.commitObject({
    id: 'retained',
    kind: 'blur',
    bounds: { x: 0, y: 0, width: 10, height: 10 },
  });
  harness.mode.handleToggleScreenshotMode(false);
  expect(harness.session.getSnapshot().document.objects).toHaveLength(1);
  expect(harness.base.handleToggleScreenshotMode).toHaveBeenCalledWith(false);
});
