import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { CaptureActionType } from '../../../../contracts/settings';
import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioProjectSummary,
  ScenarioRecentStep,
  ScenarioTrashedStep,
} from '../../../../features/scenario/contracts/types/project';
import { createDefaultScenarioSession, createDefaultScenarioSurfaceState } from './defaults';
import {
  buildEffectiveScenarioSession,
  useScenarioResponseApplier,
  useScenarioSurfaceStateApplier,
} from './appliers';
import { requestScenarioRestoreSnapshot } from '../runtime/transport/session';
import type { ScenarioControllerResponse } from '../types';

const logger = createLogger({ namespace: 'ContentScenarioControllerState' });

type ScenarioControllerStateArgs = {
  captureActionRef: { current: CaptureActionType };
  setCaptureAction: (action: CaptureActionType) => void;
  setIsToolbarVisible: (visible: boolean) => void;
  setScreenshotMode: (enabled: boolean) => void;
};

export function useScenarioControllerState(args: ScenarioControllerStateArgs) {
  const state = useScenarioControllerMutableState();
  const applySurfaceState = useScenarioSurfaceStateApplier({
    captureActionRef: args.captureActionRef,
    setCaptureAction: args.setCaptureAction,
    setIsToolbarVisible: args.setIsToolbarVisible,
    setScreenshotMode: args.setScreenshotMode,
    setSurface: state.setSurface,
    surfaceRef: state.surfaceRef,
  });
  const applyScenarioResponse = useScenarioResponseApplier({
    applySurfaceState,
    setOptimisticCaptureMode: state.setOptimisticCaptureMode,
    setProjects: state.setProjects,
    setHighlightToken: state.setRecentStepHighlightToken,
    setRecentSteps: state.setRecentSteps,
    setSession: state.setSession,
    setTrashedSteps: state.setTrashedSteps,
    sessionRef: state.sessionRef,
  });
  const effectiveSession = buildEffectiveScenarioSession(
    state.session,
    state.optimisticCaptureMode
  );

  return buildScenarioControllerStateResult({
    applyScenarioResponse,
    effectiveSession,
    optimisticCaptureMode: state.optimisticCaptureMode,
    projects: state.projects,
    recentSteps: state.recentSteps,
    recentStepHighlightToken: state.recentStepHighlightToken,
    session: state.session,
    sessionRef: state.sessionRef,
    setOptimisticCaptureMode: state.setOptimisticCaptureMode,
    trashedSteps: state.trashedSteps,
    surface: state.surface,
    surfaceRef: state.surfaceRef,
  });
}

function useScenarioControllerMutableState() {
  const [session, setSession] = useState(createDefaultScenarioSession);
  const [surface, setSurface] = useState(createDefaultScenarioSurfaceState);
  const [projects, setProjects] = useState<ScenarioProjectSummary[]>([]);
  const [recentSteps, setRecentSteps] = useState<ScenarioRecentStep[]>([]);
  const [recentStepHighlightToken, setRecentStepHighlightToken] = useState(0);
  const [trashedSteps, setTrashedSteps] = useState<ScenarioTrashedStep[]>([]);
  const [optimisticCaptureMode, setOptimisticCaptureMode] = useState<ScenarioCaptureMode | null>(
    null
  );
  const sessionRef = useRef(session);
  const surfaceRef = useRef(surface);

  useEffect(() => {
    sessionRef.current = session;
    surfaceRef.current = surface;
  }, [session, surface]);

  return {
    optimisticCaptureMode,
    projects,
    recentSteps,
    recentStepHighlightToken,
    session,
    sessionRef,
    setOptimisticCaptureMode,
    setProjects,
    setRecentSteps,
    setRecentStepHighlightToken,
    setSession,
    setSurface,
    setTrashedSteps,
    surface,
    surfaceRef,
    trashedSteps,
  };
}

function buildScenarioControllerStateResult(args: {
  applyScenarioResponse: ReturnType<typeof useScenarioResponseApplier>;
  effectiveSession: ReturnType<typeof buildEffectiveScenarioSession>;
  optimisticCaptureMode: ScenarioCaptureMode | null;
  projects: ScenarioProjectSummary[];
  recentSteps: ScenarioRecentStep[];
  recentStepHighlightToken: number;
  session: ReturnType<typeof createDefaultScenarioSession>;
  sessionRef: MutableRefObject<ReturnType<typeof createDefaultScenarioSession>>;
  setOptimisticCaptureMode: Dispatch<SetStateAction<ScenarioCaptureMode | null>>;
  trashedSteps: ScenarioTrashedStep[];
  surface: ReturnType<typeof createDefaultScenarioSurfaceState>;
  surfaceRef: MutableRefObject<ReturnType<typeof createDefaultScenarioSurfaceState>>;
}) {
  return args;
}

export function useScenarioSessionRefresh(
  applyScenarioResponse: (response: ScenarioControllerResponse) => void
) {
  const refreshGenerationRef = useRef(0);
  const refreshSession = useCallback(
    async (shouldApplyResponse?: () => boolean) => {
      const generation = refreshGenerationRef.current + 1;
      refreshGenerationRef.current = generation;
      try {
        const response = await requestScenarioRestoreSnapshot();
        if (
          generation === refreshGenerationRef.current &&
          shouldApplyResponse?.() !== false &&
          response?.success
        ) {
          applyScenarioResponse(response);
        }
      } catch (error) {
        logger.error('Failed to refresh scenario session state', error);
      }
    },
    [applyScenarioResponse]
  );

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void refreshSession();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [refreshSession]);

  return refreshSession;
}
