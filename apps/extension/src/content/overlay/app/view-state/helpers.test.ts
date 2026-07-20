import { describe, expect, it, vi } from 'vitest';

import type { ContentAppModeState } from '../mode';
import {
  buildContentModeControls,
  buildContentQuickActionState,
  buildRuntimeMessageBridgeParams,
} from './helpers';

function createModeState(): ContentAppModeState {
  return {
    aiPickMode: true,
    captureAction: 'download_default',
    captureActionRef: { current: 'download_default' },
    clearPendingAutoStartCapture: vi.fn(),
    currentViewport: { height: 720, width: 1280 },
    highlighterMode: false,
    isCompletelyHidden: false,
    isToolbarVisible: true,
    navigationLockEnabled: false,
    pendingAutoStartCapture: { type: 'selection' },
    pinToTab: false,
    quickActionOverlayRef: { current: null },
    quickActionToastCountdown: 5,
    quickEditDocumentMode: false,
    quickEditMode: false,
    queueAutoStartCapture: vi.fn(),
    saveDialogState: null,
    screenshotMode: true,
    sessionActivePresetId: 'preset-1',
    setAiPickMode: vi.fn(),
    setCaptureAction: vi.fn(),
    setCurrentViewport: vi.fn(),
    setHighlighterMode: vi.fn(),
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
    setPinToTab: vi.fn(),
    setQuickActionOverlay: vi.fn(),
    setQuickActionToastCountdown: vi.fn(),
    setQuickEditDocumentMode: vi.fn(),
    setQuickEditMode: vi.fn(),
    setSaveDialogState: vi.fn(),
    setScreenshotMode: vi.fn(),
    setSessionActivePresetId: vi.fn(),
    setTimerDelay: vi.fn(),
    timerDelay: 3,
  };
}

function buildRuntimeBridgeResult(modeState: ContentAppModeState) {
  const diagnosticsController = {
    disable: vi.fn(),
    dispose: vi.fn(),
    enable: vi.fn(),
  };

  return buildRuntimeMessageBridgeParams(
    {
      handleTakeScreenshot: vi.fn(async () => undefined),
      invalidateScreenshotRuns: vi.fn(),
      modeControls: buildContentModeControls(modeState),
      modeFlags: {
        aiPickMode: modeState.aiPickMode,
        highlighterMode: modeState.highlighterMode,
        quickEditDocumentMode: modeState.quickEditDocumentMode,
        quickEditMode: modeState.quickEditMode,
        screenshotMode: modeState.screenshotMode,
      },
      quickActionState: buildContentQuickActionState(modeState),
      visibilityState: createVisibilityState(modeState),
      viewportState: {
        currentViewport: modeState.currentViewport,
        setCurrentViewport: modeState.setCurrentViewport,
      },
    },
    diagnosticsController,
    vi.fn()
  );
}

function createVisibilityState(modeState: ContentAppModeState) {
  return {
    clearPendingAutoStartCapture: modeState.clearPendingAutoStartCapture,
    isCompletelyHidden: modeState.isCompletelyHidden,
    isToolbarVisible: modeState.isToolbarVisible,
    navigationLockEnabled: modeState.navigationLockEnabled,
    pendingAutoStartCapture: modeState.pendingAutoStartCapture,
    queueAutoStartCapture: modeState.queueAutoStartCapture,
    saveDialogState: modeState.saveDialogState,
    setIsCompletelyHidden: modeState.setIsCompletelyHidden,
    setSaveDialogState: modeState.setSaveDialogState,
  };
}

describe('app-view-model helpers', () => {
  it('reuses mode and quick-action controls when building runtime bridge params', () => {
    const modeState = createModeState();
    const result = buildRuntimeBridgeResult(modeState);

    expect(result.modeControls.setAiPickMode).toBe(modeState.setAiPickMode);
    expect(result.modeControls.setIsToolbarVisible).toBe(modeState.setIsToolbarVisible);
    expect(result.quickAction.captureActionRef).toBe(modeState.captureActionRef);
    expect(result.quickAction.setTimerDelay).toBe(modeState.setTimerDelay);
    expect(result.viewport.clearPendingAutoStartCapture).toBe(
      modeState.clearPendingAutoStartCapture
    );
    expect(result.viewport.setCurrentViewport).toBe(modeState.setCurrentViewport);
    expect(result.diagnostics.enableDiagnosticLogger).toBeTypeOf('function');
  });
});
