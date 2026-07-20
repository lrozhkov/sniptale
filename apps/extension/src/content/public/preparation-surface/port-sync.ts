import { useEffect, useRef, type MutableRefObject } from 'react';
import { disableAiPickModeIfLoaded } from '../../../content/overlay/ai/pick/runtime/lazy';
import { disableHighlighterMode } from '../../../content/selection/highlighter';
import { disableQuickEditMode } from '../../../content/selection/quick-edit';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  buildContentModeControls,
  buildContentModeFlags,
  buildContentQuickActionState,
  buildContentVisibilityState,
  buildContentViewportState,
} from '../../../content/overlay/app/view-state/helpers';
import { handleScreenshotModeMessage } from '../../../content/overlay/app/message-bridge/message-helpers';
import type { ContentPrivilegedActionIntentSource } from '../../../content/application/privileged-action-intent';
import type {
  RuntimeMessageBridgeParams,
  RuntimeMessageResponse,
} from '../../../content/overlay/app/message-bridge/types';
import type { ScreenshotStartContext } from '../../../content/overlay/screenshot/types';
import type { ContentAppModeState } from '../../../content/overlay/app/mode';
import type { ViewerPreparationCommand } from '../../../workflows/page-preparation';
import type { PreparationPortConnector } from './types';

function handlePreparationPortCommand(
  command: ViewerPreparationCommand,
  bridgeParamsRef: MutableRefObject<RuntimeMessageBridgeParams>
): void {
  if (command.type === MessageType.SET_VIEWPORT) {
    bridgeParamsRef.current.viewport.setCurrentViewport(command.viewport ?? null);
    return;
  }

  let response: RuntimeMessageResponse | undefined;
  const handled = handleScreenshotModeMessage(command, bridgeParamsRef.current, (nextResponse) => {
    response = nextResponse;
  });
  if (!handled) {
    throw new Error('Unsupported web snapshot viewer preparation command.');
  }
  if (response?.['success'] === false) {
    const error = response['error'];
    throw new Error(typeof error === 'string' ? error : 'Web snapshot viewer preparation failed.');
  }
}

function createPreparationBridgeParams(
  modeState: ContentAppModeState,
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
      disableHighlighterMode,
      disableQuickEditMode,
    },
    modeState: {
      ...buildContentModeFlags(modeState),
      isToolbarVisible: modeState.isToolbarVisible,
    },
    quickAction: buildContentQuickActionState(modeState),
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
    createPreparationBridgeParams(modeState, handleTakeScreenshot, invalidateScreenshotRuns)
  );
  bridgeParamsRef.current = createPreparationBridgeParams(
    modeState,
    handleTakeScreenshot,
    invalidateScreenshotRuns
  );

  useEffect(() => {
    return connectPort((command: ViewerPreparationCommand) => {
      handlePreparationPortCommand(command, bridgeParamsRef);
    }, onPopupExportRequest);
  }, [connectPort, onPopupExportRequest]);
}
