import { useEffect } from 'react';
import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import {
  getLoadedHighlighterSettingsSnapshot,
  loadHighlighterSettings,
} from '../../../../composition/persistence/highlighter';
import {
  createScenarioCapturePayloadBuilder,
  createScenarioSelectionCaptureSaver,
  type ScenarioCaptureSourceAdapter,
} from '../capture/source';
import { createScenarioControllerActions } from './actions';
import type { ScenarioControllerResponse } from '../types';

export { buildScenarioControllerViewState } from '../view-state';

function ensureScenarioCaptureSettingsReady(): Promise<void> {
  if (getLoadedHighlighterSettingsSnapshot()) {
    return Promise.resolve();
  }

  return loadHighlighterSettings().then(() => undefined);
}

export function useScenarioControllerRuntime(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  currentSurfaceRef: { current: ScenarioRecorderSurfaceState };
  effectiveSession: ScenarioSessionState;
  navigationLockEnabled: boolean;
  refreshSession: () => Promise<void>;
  screenshotMode: boolean;
  sessionRef: { current: ScenarioSessionState };
  setNavigationLockEnabled: (enabled: boolean) => void;
  setOptimisticCaptureMode: (captureMode: ScenarioCaptureMode | null) => void;
  sourceAdapter?: ScenarioCaptureSourceAdapter;
}) {
  useEffect(() => {
    ensureScenarioCaptureSettingsReady().catch(() => undefined);
  }, []);

  const buildCapturePayload = createScenarioCapturePayloadBuilder({
    session: args.effectiveSession,
    screenshotMode: args.screenshotMode,
    ...(args.sourceAdapter === undefined ? {} : { sourceAdapter: args.sourceAdapter }),
  });
  const saveSelectionCapture = createScenarioSelectionCaptureSaver({
    applyScenarioResponse: args.applyScenarioResponse,
    buildCapturePayload,
  });
  const controllerActions = createScenarioControllerActions({
    applyScenarioResponse: args.applyScenarioResponse,
    currentSurfaceRef: args.currentSurfaceRef,
    navigationLockEnabled: args.navigationLockEnabled,
    refreshSession: args.refreshSession,
    screenshotMode: args.screenshotMode,
    sessionRef: args.sessionRef,
    setNavigationLockEnabled: args.setNavigationLockEnabled,
    setOptimisticCaptureMode: args.setOptimisticCaptureMode,
  });

  return {
    buildCapturePayload,
    controllerActions,
    ensureCaptureReady: ensureScenarioCaptureSettingsReady,
    saveSelectionCapture,
  };
}
