import { finishScenarioRecording } from '../mutation/finish';
import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import {
  applyScenarioRecorderPanelVisibility,
  applyScenarioCaptureMode,
  applyScenarioEnabledState,
  applyScenarioRememberSelection,
  applyScenarioScreenshotModeDisabled,
  applyScenarioSidebarVisibility,
} from '../mutation/mode';
import { applyScenarioProjectCreation, applyScenarioProjectSelection } from '../mutation/project';
import { applyScenarioDeleteRecentStep, applyScenarioMoveRecentStep } from '../mutation/step';
import { openScenarioEditor } from './transport/projects';
import type { ScenarioControllerResponse } from '../types';

function createScenarioControllerModeActions(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  currentSurfaceRef: { current: ScenarioRecorderSurfaceState };
  navigationLockEnabled: boolean;
  screenshotMode: boolean;
  setNavigationLockEnabled: (enabled: boolean) => void;
  setOptimisticCaptureMode: (captureMode: ScenarioCaptureMode | null) => void;
}) {
  return {
    handleScreenshotModeDisabled: () =>
      applyScenarioScreenshotModeDisabled({
        applyScenarioResponse: args.applyScenarioResponse,
        currentSurface: args.currentSurfaceRef.current,
      }),
    setCaptureMode: (captureMode: ScenarioCaptureMode) =>
      applyScenarioCaptureMode({
        applyScenarioResponse: args.applyScenarioResponse,
        captureMode,
        navigationLockEnabled: args.navigationLockEnabled,
        screenshotMode: args.screenshotMode,
        setNavigationLockEnabled: args.setNavigationLockEnabled,
        setOptimisticCaptureMode: args.setOptimisticCaptureMode,
      }),
    setEnabled: (enabled: boolean) =>
      applyScenarioEnabledState({ applyScenarioResponse: args.applyScenarioResponse, enabled }),
    setRememberProjectSelection: (value: boolean) =>
      applyScenarioRememberSelection({
        applyScenarioResponse: args.applyScenarioResponse,
        rememberProjectSelection: value,
      }),
    setSidebarVisible: (visible: boolean) =>
      applyScenarioSidebarVisibility({
        applyScenarioResponse: args.applyScenarioResponse,
        sidebarVisible: visible,
      }),
  };
}

function createScenarioControllerProjectActions(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  refreshSession: () => Promise<void>;
  sessionRef: { current: ScenarioSessionState };
}) {
  return {
    createProject: (name: string) =>
      applyScenarioProjectCreation({
        applyScenarioResponse: args.applyScenarioResponse,
        currentSession: args.sessionRef.current,
        name,
        refreshSession: args.refreshSession,
      }),
    openEditor: (stepId?: string | null) =>
      openScenarioEditor({
        projectId: args.sessionRef.current.projectId,
        ...(stepId === undefined ? {} : { stepId }),
      }),
    selectProject: (projectId: string | null) =>
      applyScenarioProjectSelection({
        applyScenarioResponse: args.applyScenarioResponse,
        currentSession: args.sessionRef.current,
        projectId,
      }),
  };
}

function createScenarioControllerStepActions(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  sessionRef: { current: ScenarioSessionState };
}) {
  return {
    deleteRecentStep: (stepId: string) =>
      applyRecentStepMutation({
        action: () =>
          applyScenarioDeleteRecentStep({
            applyScenarioResponse: args.applyScenarioResponse,
            projectId: args.sessionRef.current.projectId!,
            stepId,
          }),
        projectId: args.sessionRef.current.projectId,
      }),
    moveRecentStep: (stepId: string, toIndex: number) =>
      applyRecentStepMutation({
        action: () =>
          applyScenarioMoveRecentStep({
            applyScenarioResponse: args.applyScenarioResponse,
            projectId: args.sessionRef.current.projectId!,
            stepId,
            toIndex,
          }),
        projectId: args.sessionRef.current.projectId,
      }),
  };
}

async function applyRecentStepMutation(args: {
  action: () => Promise<void>;
  projectId: string | null;
}) {
  if (!args.projectId) {
    return;
  }

  await args.action();
}

/** Retains one recorder-panel request across controller rerenders. */
export type ScenarioPanelPendingOperation = { visible: boolean; promise: Promise<boolean> };

export function createScenarioControllerActions(args: {
  panelPendingRef: { current: ScenarioPanelPendingOperation | null };
  finishPendingRef: { current: Promise<void> | null };
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  currentSurfaceRef: { current: ScenarioRecorderSurfaceState };
  navigationLockEnabled: boolean;
  refreshSession: () => Promise<void>;
  screenshotMode: boolean;
  sessionRef: { current: ScenarioSessionState };
  setNavigationLockEnabled: (enabled: boolean) => void;
  setOptimisticCaptureMode: (captureMode: ScenarioCaptureMode | null) => void;
}) {
  return {
    /** Activates the recorder on first open and otherwise changes only panel visibility. */
    setRecorderPanelVisible: (visible: boolean): Promise<boolean> => {
      const pending = args.panelPendingRef.current;
      if (pending) return pending.visible === visible ? pending.promise : Promise.resolve(false);
      const promise = applyScenarioRecorderPanelVisibility({
        applyScenarioResponse: args.applyScenarioResponse,
        currentSession: { ...args.sessionRef.current },
        currentSurface: { ...args.currentSurfaceRef.current },
        refreshSession: args.refreshSession,
        screenshotMode: args.screenshotMode,
        visible,
      }).finally(() => {
        if (args.panelPendingRef.current?.promise === promise) args.panelPendingRef.current = null;
      });
      args.panelPendingRef.current = { visible, promise };
      return promise;
    },
    finishRecording: () => {
      if (!args.finishPendingRef.current) {
        args.finishPendingRef.current = finishScenarioRecording({
          applyScenarioResponse: args.applyScenarioResponse,
          currentSession: args.sessionRef.current,
          currentSurface: args.currentSurfaceRef.current,
          refreshSession: args.refreshSession,
        }).finally(() => {
          args.finishPendingRef.current = null;
        });
      }
      return args.finishPendingRef.current;
    },
    ...createScenarioControllerModeActions(args),
    ...createScenarioControllerProjectActions(args),
    ...createScenarioControllerStepActions(args),
  };
}
