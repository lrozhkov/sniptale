import {
  useCaptureActionPreference,
  usePinnedToolbarModeCleanup,
  usePinnedToolbarRestore,
  useQuickActionToastCountdown,
  useSessionPresetReset,
} from './effects';
import {
  type ContentAppModeControls,
  type ContentAppModeFlags,
  type ContentAppModeState,
  type ContentAppQuickActionState,
  type ContentAppRuntimeModeControls,
  type ContentAppViewportState,
  type ContentAppVisibilityState,
  type QueueAutoStartCapture,
} from './state';
import { useContentModeFlags } from './state/flags';
import { useContentSurfaceState } from './state/surface';

export type {
  ContentAppModeControls,
  ContentAppModeFlags,
  ContentAppModeState,
  ContentAppQuickActionState,
  ContentAppRuntimeModeControls,
  ContentAppViewportState,
  ContentAppVisibilityState,
  QueueAutoStartCapture,
};

function useContentAppCoreState(): ContentAppModeState {
  return {
    ...useContentModeFlags(),
    ...useContentSurfaceState(),
  };
}

export function useContentAppModeState() {
  const state = useContentAppCoreState();
  const scenarioPinned = state.captureAction === 'scenario';

  useCaptureActionPreference(state.captureAction, state.setCaptureAction);
  usePinnedToolbarModeCleanup({
    pinToTab: state.pinToTab,
    scenarioPinned,
    screenshotMode: state.screenshotMode,
    setPinToTab: state.setPinToTab,
  });
  usePinnedToolbarRestore({
    pinToTab: state.pinToTab,
    scenarioPinned,
    screenshotMode: state.screenshotMode,
    setCurrentViewport: state.setCurrentViewport,
    setIsToolbarVisible: state.setIsToolbarVisible,
    setScreenshotMode: state.setScreenshotMode,
  });
  useSessionPresetReset(state.screenshotMode, state.setSessionActivePresetId);
  useQuickActionToastCountdown(state.quickActionToastCountdown, state.setQuickActionToastCountdown);

  return state;
}
