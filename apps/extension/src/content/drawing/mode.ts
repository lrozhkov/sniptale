import { useCallback, useEffect, useRef } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../platform/i18n';
import { registerContentMode, setContentModeEnabled } from '../application/mode-session';
import type { ContentDrawingController } from './controller';

interface DrawingModeState {
  drawingMode?: boolean;
  screenshotMode: boolean;
  setDrawingMode?: (enabled: boolean) => void;
  setNavigationLockEnabled: (enabled: boolean) => void;
}

interface DrawingModeController {
  handleClearHighlights: () => void;
  handleEnableCursorMode: () => boolean;
  handleHideToolbar: () => void;
  handleToggleHighlighterMode: (enabled: boolean) => void;
  handleToggleDesignReviewMode: (enabled: boolean) => void;
  handleToggleDrawingMode?: (enabled: boolean) => void;
  handleToggleNavigationLock: (enabled: boolean) => void;
  handleToggleQuickEditDocumentMode: (enabled: boolean) => void;
  handleToggleQuickEditMode: (enabled: boolean) => void;
  handleToggleScreenshotMode: (enabled: boolean) => void;
}

export function useDrawingModeIntegration(args: {
  baseModeController: DrawingModeController;
  controller: ContentDrawingController;
  modeState: DrawingModeState;
}) {
  const { baseModeController, controller, modeState } = args;
  const { drawingMode, screenshotMode, setDrawingMode, setNavigationLockEnabled } = modeState;
  const previousScreenshotModeRef = useRef(screenshotMode);
  const disableDrawing = useCallback(() => {
    controller.finalizeInteraction();
    setDrawingMode?.(false);
  }, [controller, setDrawingMode]);

  useEffect(() => {
    registerContentMode('drawing', () => {
      disableDrawing();
      setNavigationLockEnabled(false);
    });
    setContentModeEnabled('drawing', drawingMode === true);
  }, [disableDrawing, drawingMode, setNavigationLockEnabled]);

  useEffect(() => {
    if (previousScreenshotModeRef.current && !screenshotMode) {
      disableDrawing();
    }
    previousScreenshotModeRef.current = screenshotMode;
  }, [controller, disableDrawing, screenshotMode]);

  const modeController = createDrawingModeController({
    baseModeController,
    controller,
    disableDrawing,
    onUnavailable: () => showToast(translate('content.toolbar.drawingUnavailable'), 'error'),
    setDrawingMode,
    setNavigationLockEnabled,
  });
  return { disableDrawing, modeController };
}

export function createDrawingModeController(args: {
  baseModeController: DrawingModeController;
  controller: ContentDrawingController;
  disableDrawing: () => void;
  onUnavailable: () => void;
  setDrawingMode: ((enabled: boolean) => void) | undefined;
  setNavigationLockEnabled: (enabled: boolean) => void;
}): DrawingModeController {
  const { baseModeController, controller, disableDrawing } = args;
  const disableBefore = (enabled: boolean, action: (enabled: boolean) => void) => {
    if (enabled) disableDrawing();
    action(enabled);
  };
  return {
    ...baseModeController,
    handleEnableCursorMode: () => {
      disableDrawing();
      return baseModeController.handleEnableCursorMode();
    },
    handleToggleDrawingMode: (enabled) => {
      if (!enabled) {
        disableDrawing();
        args.setNavigationLockEnabled(false);
        return;
      }
      if (!controller.prepareActivation()) {
        args.onUnavailable();
        return;
      }
      if (!baseModeController.handleEnableCursorMode()) return;
      controller.session.setActiveTool('pencil');
      args.setDrawingMode?.(true);
      // The drawing canvas is the interaction shield. The generic navigation-lock
      // overlay would sit above it and consume every drawing pointer event.
      args.setNavigationLockEnabled(false);
    },
    handleToggleHighlighterMode: (enabled) =>
      disableBefore(enabled, baseModeController.handleToggleHighlighterMode),
    handleToggleQuickEditMode: (enabled) =>
      disableBefore(enabled, baseModeController.handleToggleQuickEditMode),
    handleToggleQuickEditDocumentMode: (enabled) =>
      disableBefore(enabled, baseModeController.handleToggleQuickEditDocumentMode),
    handleToggleDesignReviewMode: (enabled) =>
      disableBefore(enabled, baseModeController.handleToggleDesignReviewMode),
    handleToggleScreenshotMode: (enabled) => {
      if (!enabled) {
        disableDrawing();
      }
      baseModeController.handleToggleScreenshotMode(enabled);
    },
  };
}
