import type { CaptureActionType } from '../../../contracts/settings';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import {
  useScenarioAutoClickCapture,
  useScenarioNavigationLockOverride,
  useScenarioSuggestedEventLogging,
} from './effects';
import type { BuildScenarioCapturePayload } from './auto-click-capture/shared';
import type {
  ScenarioAutoClickCaptureTransport,
  ScenarioAutoClickListenerRegistry,
} from './auto-click-capture/shared';
import { useScenarioControllerState, useScenarioSessionRefresh } from './session/state';
import { buildScenarioControllerViewState, useScenarioControllerRuntime } from './runtime';
import type { ScenarioCaptureSourceAdapter } from './capture/source';

type UseScenarioControllerParams = {
  autoClickBlocked: boolean;
  captureActionRef: { current: CaptureActionType };
  setCaptureAction: (action: CaptureActionType) => void;
  navigationLockEnabled: boolean;
  setIsToolbarVisible: (visible: boolean) => void;
  setNavigationLockEnabled: (enabled: boolean) => void;
  setIsCompletelyHidden: (hidden: boolean) => void;
  setScreenshotMode: (enabled: boolean) => void;
  sourceAdapter?: ScenarioCaptureSourceAdapter;
  autoClickCaptureTransport?: ScenarioAutoClickCaptureTransport;
  registerAutoClickListeners?: ScenarioAutoClickListenerRegistry;
  screenshotMode: boolean;
};

export function useScenarioController(params: UseScenarioControllerParams) {
  const controllerState = useScenarioControllerState({
    captureActionRef: params.captureActionRef,
    setCaptureAction: params.setCaptureAction,
    setIsToolbarVisible: params.setIsToolbarVisible,
    setScreenshotMode: params.setScreenshotMode,
  });
  const refreshSession = useScenarioSessionRefresh(controllerState.applyScenarioResponse);
  const scenarioRuntime = useScenarioControllerRuntime({
    applyScenarioResponse: controllerState.applyScenarioResponse,
    currentSurfaceRef: controllerState.surfaceRef,
    effectiveSession: controllerState.effectiveSession,
    navigationLockEnabled: params.navigationLockEnabled,
    refreshSession,
    screenshotMode: params.screenshotMode,
    sessionRef: controllerState.sessionRef,
    setNavigationLockEnabled: params.setNavigationLockEnabled,
    setOptimisticCaptureMode: controllerState.setOptimisticCaptureMode,
    ...(params.sourceAdapter === undefined ? {} : { sourceAdapter: params.sourceAdapter }),
  });
  useScenarioControllerEffects({
    buildCapturePayload: scenarioRuntime.buildCapturePayload,
    blocked: params.autoClickBlocked,
    navigationLockEnabled: params.navigationLockEnabled,
    pendingProjectSelection: controllerState.effectiveSession.pendingProjectSelection,
    projectId: controllerState.effectiveSession.projectId,
    refreshSession,
    scenarioCaptureMode: controllerState.effectiveSession.captureMode,
    scenarioEnabled: controllerState.effectiveSession.enabled,
    screenshotMode: params.screenshotMode,
    session: controllerState.effectiveSession,
    ...(params.autoClickCaptureTransport === undefined
      ? {}
      : { captureTransport: params.autoClickCaptureTransport }),
    ...(params.registerAutoClickListeners === undefined
      ? {}
      : { registerAutoClickListeners: params.registerAutoClickListeners }),
    setIsCompletelyHidden: params.setIsCompletelyHidden,
    setNavigationLockEnabled: params.setNavigationLockEnabled,
  });

  return buildScenarioControllerResult({
    controllerState,
    refreshSession,
    scenarioRuntime,
  });
}

function useScenarioControllerEffects(args: {
  buildCapturePayload: BuildScenarioCapturePayload;
  blocked: boolean;
  captureTransport?: ScenarioAutoClickCaptureTransport;
  navigationLockEnabled: boolean;
  pendingProjectSelection: boolean;
  projectId: string | null;
  registerAutoClickListeners?: ScenarioAutoClickListenerRegistry;
  refreshSession: () => Promise<void>;
  scenarioCaptureMode: ScenarioSessionState['captureMode'];
  scenarioEnabled: boolean;
  screenshotMode: boolean;
  session: ScenarioSessionState;
  setIsCompletelyHidden: (hidden: boolean) => void;
  setNavigationLockEnabled: (enabled: boolean) => void;
}) {
  useScenarioSuggestedEventLogging({
    pendingProjectSelection: args.pendingProjectSelection,
    projectId: args.projectId,
    scenarioEnabled: args.scenarioEnabled,
    screenshotMode: args.screenshotMode,
  });
  useScenarioNavigationLockOverride({
    navigationLockEnabled: args.navigationLockEnabled,
    pendingProjectSelection: args.pendingProjectSelection,
    scenarioCaptureMode: args.scenarioCaptureMode,
    scenarioEnabled: args.scenarioEnabled,
    setNavigationLockEnabled: args.setNavigationLockEnabled,
    screenshotMode: args.screenshotMode,
  });
  useScenarioAutoClickCapture({
    blocked: args.blocked,
    screenshotMode: args.screenshotMode,
    session: args.session,
    buildCapturePayload: args.buildCapturePayload,
    ...(args.captureTransport === undefined ? {} : { captureTransport: args.captureTransport }),
    ...(args.registerAutoClickListeners === undefined
      ? {}
      : { registerListeners: args.registerAutoClickListeners }),
    refreshSession: args.refreshSession,
    setIsCompletelyHidden: args.setIsCompletelyHidden,
  });
}

function buildScenarioControllerResult(args: {
  controllerState: ReturnType<typeof useScenarioControllerState>;
  refreshSession: () => Promise<void>;
  scenarioRuntime: ReturnType<typeof useScenarioControllerRuntime>;
}) {
  return {
    ...args.scenarioRuntime.controllerActions,
    ensureCaptureReady: args.scenarioRuntime.ensureCaptureReady,
    ...buildScenarioControllerViewState({
      buildCapturePayload: args.scenarioRuntime.buildCapturePayload,
      captureAction: args.controllerState.surface.captureAction,
      effectiveSession: args.controllerState.effectiveSession,
      projects: args.controllerState.projects,
      recentStepHighlightToken: args.controllerState.recentStepHighlightToken,
      recentSteps: args.controllerState.recentSteps,
      refreshSession: args.refreshSession,
      saveSelectionCapture: args.scenarioRuntime.saveSelectionCapture,
      sidebarVisible: args.controllerState.session.sidebarVisible,
      trashedSteps: args.controllerState.trashedSteps,
    }),
  };
}
