import { useEffect, useRef } from 'react';

import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  createRuntimeMessageHandler,
  type RuntimeMessageBridgeDiagnosticControls,
  type RuntimeMessageBridgeDialogControls,
  type RuntimeMessageBridgeModeControls,
  type RuntimeMessageBridgeModeState,
  type RuntimeMessageBridgeParams,
  type RuntimeMessageBridgeQuickActionControls,
  type RuntimeMessageBridgeViewportControls,
} from './helpers';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import type { ScreenshotStartContext } from '../../screenshot/types';

interface UseRuntimeMessageBridgeParams {
  diagnostics: RuntimeMessageBridgeDiagnosticControls;
  dialogs: RuntimeMessageBridgeDialogControls;
  modeControls: RuntimeMessageBridgeModeControls;
  modeState: RuntimeMessageBridgeModeState;
  quickAction: RuntimeMessageBridgeQuickActionControls;
  viewport: Omit<RuntimeMessageBridgeViewportControls, 'handleTakeScreenshotRef'> & {
    handleTakeScreenshot: (
      type: 'visible' | 'full' | 'selection',
      contentIntentSource?: ContentPrivilegedActionIntentSource,
      startContext?: ScreenshotStartContext
    ) => Promise<void>;
  };
}

function buildBridgeParams(
  params: UseRuntimeMessageBridgeParams,
  handleTakeScreenshotRef: RuntimeMessageBridgeViewportControls['handleTakeScreenshotRef']
): RuntimeMessageBridgeParams {
  return {
    diagnostics: params.diagnostics,
    dialogs: params.dialogs,
    modeControls: params.modeControls,
    modeState: params.modeState,
    quickAction: params.quickAction,
    viewport: {
      clearPendingAutoStartCapture: params.viewport.clearPendingAutoStartCapture,
      handleTakeScreenshotRef,
      invalidateScreenshotRuns: params.viewport.invalidateScreenshotRuns,
      queueAutoStartCapture: params.viewport.queueAutoStartCapture,
      setCurrentViewport: params.viewport.setCurrentViewport,
    },
  };
}

export function useRuntimeMessageBridge(params: UseRuntimeMessageBridgeParams): void {
  const handleTakeScreenshotRef = useRef<
    UseRuntimeMessageBridgeParams['viewport']['handleTakeScreenshot']
  >(params.viewport.handleTakeScreenshot);
  handleTakeScreenshotRef.current = params.viewport.handleTakeScreenshot;

  const bridgeParamsRef = useRef<RuntimeMessageBridgeParams>(
    buildBridgeParams(params, handleTakeScreenshotRef)
  );
  bridgeParamsRef.current = buildBridgeParams(params, handleTakeScreenshotRef);

  useEffect(() => {
    const handleMessage = createRuntimeMessageHandler(() => bridgeParamsRef.current);

    return browserRuntime.subscribeToMessages(handleMessage);
  }, []);
}
