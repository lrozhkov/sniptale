import { useCallback } from 'react';
import type { CaptureActionType } from '../../../../contracts/settings';
import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import { useScenarioResponseApplier as useScenarioResponseApplierInternal } from '../response/applier';

type ScenarioResponseApplierArgs = Parameters<typeof useScenarioResponseApplierInternal>[0];

export function buildEffectiveScenarioSession(
  session: ScenarioSessionState,
  optimisticCaptureMode: ScenarioCaptureMode | null
) {
  if (optimisticCaptureMode === null) {
    return session;
  }

  return {
    ...session,
    captureMode: optimisticCaptureMode,
  };
}

export function useScenarioSurfaceStateApplier(args: {
  captureActionRef: { current: CaptureActionType };
  setCaptureAction: (action: CaptureActionType) => void;
  setIsToolbarVisible: (visible: boolean) => void;
  setScreenshotMode: (enabled: boolean) => void;
  setSurface: React.Dispatch<React.SetStateAction<ScenarioRecorderSurfaceState>>;
  surfaceRef: { current: ScenarioRecorderSurfaceState };
}) {
  const {
    captureActionRef,
    setCaptureAction,
    setIsToolbarVisible,
    setScreenshotMode,
    setSurface,
    surfaceRef,
  } = args;

  return useCallback(
    (nextSurface: ScenarioRecorderSurfaceState, options?: { syncModeState?: boolean }) => {
      setSurface(nextSurface);
      surfaceRef.current = nextSurface;
      captureActionRef.current = nextSurface.captureAction;
      setCaptureAction(nextSurface.captureAction);
      if (options?.syncModeState ?? true) {
        setScreenshotMode(nextSurface.screenshotMode);
        setIsToolbarVisible(nextSurface.toolbarVisible);
      }
    },
    [
      captureActionRef,
      setCaptureAction,
      setIsToolbarVisible,
      setScreenshotMode,
      setSurface,
      surfaceRef,
    ]
  );
}

export function useScenarioResponseApplier(args: ScenarioResponseApplierArgs) {
  return useScenarioResponseApplierInternal(args);
}
