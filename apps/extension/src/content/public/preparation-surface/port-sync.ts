import { useEffect, useRef, type MutableRefObject } from 'react';
import { disableAiPickModeIfLoaded } from '../../../content/overlay/ai/pick/runtime/lazy';
import { disableHighlighterMode } from '../../../content/selection/highlighter';
import { disableQuickEditMode } from '../../../content/selection/quick-edit';
import { disableDesignReviewMode } from '../../../content/selection/design-review';
import {
  buildContentModeControls,
  buildContentModeFlags,
  buildContentQuickActionState,
  buildContentVisibilityState,
  buildContentViewportState,
} from '../../../content/overlay/app/view-state/helpers';
import { handleScreenshotModeMessage } from '../../../content/overlay/app/message-bridge/message-helpers';
import type { ContentPrivilegedActionIntentSource } from '../../../content/application/privileged-action-intent';
import type { RuntimeMessageBridgeParams } from '../../../content/overlay/app/message-bridge/types';
import type { ScreenshotStartContext } from '../../../content/overlay/screenshot/types';
import type { ContentAppModeState } from '../../../content/overlay/app/mode';
import type { UseToolbarModeControllerResult } from '../../../content/overlay/toolbar/mode-controller/types';
import { selectToolbarWorkingMode } from '../../../content/overlay/app/message-bridge/working-modes';
import {
  PREPARATION_SURFACE_RESIZE,
  type ViewerPreparationCommand,
} from '../../../workflows/page-preparation';
import type { PreparationPortConnector } from './types';

function handlePreparationPortCommand(
  command: ViewerPreparationCommand,
  bridgeParamsRef: MutableRefObject<RuntimeMessageBridgeParams>
): Promise<void> {
  if (command.type === PREPARATION_SURFACE_RESIZE) {
    bridgeParamsRef.current.viewport.setCurrentViewport(command.viewport ?? null);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const handled = handleScreenshotModeMessage(command, bridgeParamsRef.current, (response) => {
      if (response?.['success'] === false) {
        const error = response['error'];
        reject(
          new Error(typeof error === 'string' ? error : 'Web snapshot viewer preparation failed.')
        );
        return;
      }
      resolve();
    });
    if (!handled) {
      reject(new Error('Unsupported web snapshot viewer preparation command.'));
    }
  });
}

function createPreparationBridgeParams(
  modeState: ContentAppModeState,
  modeController: UseToolbarModeControllerResult,
  handleTakeScreenshot: (
    type: 'visible' | 'full' | 'selection',
    contentIntentSource?: ContentPrivilegedActionIntentSource,
    startContext?: ScreenshotStartContext
  ) => Promise<void>,
  invalidateScreenshotRuns: () => ScreenshotStartContext | undefined
): RuntimeMessageBridgeParams {
  return {
    diagnostics: {
      disableDiagnosticLogger: () => undefined,
      enableDiagnosticLogger: () => undefined,
    },
    dialogs: {
      setSaveDialogState: modeState.setSaveDialogState,
    },
    modeControls: {
      ...buildContentModeControls(modeState),
      disableAiPickMode: disableAiPickModeIfLoaded,
      disableDesignReviewMode,
      disableHighlighterMode,
      disableQuickEditMode,
    },
    modeState: {
      ...buildContentModeFlags(modeState),
      isToolbarVisible: modeState.isToolbarVisible,
    },
    quickAction: buildContentQuickActionState(modeState),
    workingModes: {
      select: (mode) => selectToolbarWorkingMode(modeController, mode),
    },
    viewport: {
      ...buildContentViewportState(modeState),
      clearPendingAutoStartCapture: modeState.clearPendingAutoStartCapture,
      handleTakeScreenshotRef: { current: handleTakeScreenshot },
      invalidateScreenshotRuns,
      queueAutoStartCapture: buildContentVisibilityState(modeState).queueAutoStartCapture,
    },
  };
}

export function usePreparationSurfacePortSync(
  modeState: ContentAppModeState,
  modeController: UseToolbarModeControllerResult,
  handleTakeScreenshot: (
    type: 'visible' | 'full' | 'selection',
    contentIntentSource?: ContentPrivilegedActionIntentSource,
    startContext?: ScreenshotStartContext
  ) => Promise<void>,
  invalidateScreenshotRuns: () => ScreenshotStartContext | undefined,
  connectPort: PreparationPortConnector,
  onPopupExportRequest?: Parameters<PreparationPortConnector>[1]
): void {
  const bridgeParamsRef = useRef<RuntimeMessageBridgeParams>(
    createPreparationBridgeParams(
      modeState,
      modeController,
      handleTakeScreenshot,
      invalidateScreenshotRuns
    )
  );
  bridgeParamsRef.current = createPreparationBridgeParams(
    modeState,
    modeController,
    handleTakeScreenshot,
    invalidateScreenshotRuns
  );

  useEffect(() => {
    return connectPort(
      (command: ViewerPreparationCommand) => handlePreparationPortCommand(command, bridgeParamsRef),
      onPopupExportRequest
    );
  }, [connectPort, onPopupExportRequest]);
}
