import { useCallback, useMemo, useRef } from 'react';
import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioProjectSummary,
  ScenarioRecentStep,
  ScenarioTrashedStep,
} from '../../../../features/scenario/contracts/types/project';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import {
  createScenarioCollectionsApplier,
  type ScenarioCollectionsApplierArgs,
} from './collections';
import {
  applyScenarioSnapshotOrData,
  createScenarioResponseDataApplier,
  createScenarioRestoreSnapshotApplier,
  type ScenarioResponseDataApplierArgs,
  type ScenarioRestoreSnapshotApplierArgs,
} from './session-surface';
import type { ScenarioControllerResponse } from '../types';

type ScenarioResponseApplierArgs = {
  applySurfaceState: (
    nextSurface: ScenarioRecorderSurfaceState,
    options?: { syncModeState?: boolean }
  ) => void;
  sessionRef: { current: ScenarioSessionState };
  setOptimisticCaptureMode: (captureMode: ScenarioCaptureMode | null) => void;
  setProjects: React.Dispatch<React.SetStateAction<ScenarioProjectSummary[]>>;
  setHighlightToken: React.Dispatch<React.SetStateAction<number>>;
  setRecentSteps: React.Dispatch<React.SetStateAction<ScenarioRecentStep[]>>;
  setSession: React.Dispatch<React.SetStateAction<ScenarioSessionState>>;
  setTrashedSteps: React.Dispatch<React.SetStateAction<ScenarioTrashedStep[]>>;
};

export function useScenarioResponseApplier(args: ScenarioResponseApplierArgs) {
  const {
    applySurfaceState,
    sessionRef,
    setOptimisticCaptureMode,
    setProjects,
    setHighlightToken,
    setRecentSteps,
    setSession,
    setTrashedSteps,
  } = args;
  const applyRestoreSnapshot = useScenarioRestoreSnapshotApplier({
    applySurfaceState,
    sessionRef,
    setOptimisticCaptureMode,
    setSession,
  });
  const applyScenarioResponseData = useScenarioResponseDataApplier({
    applySurfaceState,
    setOptimisticCaptureMode,
    setSession,
  });
  const applyScenarioCollections = useScenarioCollectionsApplier({
    setProjects,
    setHighlightToken,
    setRecentSteps,
    setTrashedSteps,
  });
  return useCallback(
    (response: ScenarioControllerResponse) => {
      applyScenarioSnapshotOrData(response, {
        applyRestoreSnapshot,
        applyScenarioResponseData,
      });
      applyScenarioCollections(response);
    },
    [applyRestoreSnapshot, applyScenarioCollections, applyScenarioResponseData]
  );
}

function useScenarioRestoreSnapshotApplier({
  applySurfaceState,
  sessionRef,
  setOptimisticCaptureMode,
  setSession,
}: ScenarioRestoreSnapshotApplierArgs) {
  return useMemo(
    () =>
      createScenarioRestoreSnapshotApplier({
        applySurfaceState,
        sessionRef,
        setOptimisticCaptureMode,
        setSession,
      }),
    [applySurfaceState, sessionRef, setOptimisticCaptureMode, setSession]
  );
}

function useScenarioResponseDataApplier({
  applySurfaceState,
  setOptimisticCaptureMode,
  setSession,
}: ScenarioResponseDataApplierArgs) {
  return useMemo(
    () =>
      createScenarioResponseDataApplier({
        applySurfaceState,
        setOptimisticCaptureMode,
        setSession,
      }),
    [applySurfaceState, setOptimisticCaptureMode, setSession]
  );
}

function useScenarioCollectionsApplier(args: {
  setProjects: React.Dispatch<React.SetStateAction<ScenarioProjectSummary[]>>;
  setHighlightToken: React.Dispatch<React.SetStateAction<number>>;
  setRecentSteps: React.Dispatch<React.SetStateAction<ScenarioRecentStep[]>>;
  setTrashedSteps: React.Dispatch<React.SetStateAction<ScenarioTrashedStep[]>>;
}) {
  const hasLoadedStepsRef = useRef(false);
  const prevIdsRef = useRef<string[]>([]);
  const collectionsArgs = useMemo<ScenarioCollectionsApplierArgs>(
    () => ({
      hasLoadedStepsRef,
      prevIdsRef,
      setHighlightToken: args.setHighlightToken,
      setProjects: args.setProjects,
      setRecentSteps: args.setRecentSteps,
      setTrashedSteps: args.setTrashedSteps,
    }),
    [args.setHighlightToken, args.setProjects, args.setRecentSteps, args.setTrashedSteps]
  );

  return useMemo(() => createScenarioCollectionsApplier(collectionsArgs), [collectionsArgs]);
}
