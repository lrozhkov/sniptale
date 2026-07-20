import type { CaptureActionType } from '../../../../contracts/settings';
import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import {
  applyScenarioCaptureAction,
  applyScenarioCaptureMode,
  applyScenarioEnabledState,
  applyScenarioRememberSelection,
  applyScenarioScreenshotModeDisabled,
  applyScenarioSidebarVisibility,
} from '../mutation/mode';
import { applyScenarioProjectCreation, applyScenarioProjectSelection } from '../mutation/project';
import {
  applyScenarioDeleteRecentStep,
  applyScenarioMoveRecentStep,
  applyScenarioRestoreRecentStep,
} from '../mutation/step';
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
    applyCaptureAction: (actionType: CaptureActionType) =>
      applyScenarioCaptureAction({
        actionType,
        applyScenarioResponse: args.applyScenarioResponse,
        currentSurface: args.currentSurfaceRef.current,
      }),
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
    restoreRecentStep: (stepId: string) =>
      applyRecentStepMutation({
        action: () =>
          applyScenarioRestoreRecentStep({
            applyScenarioResponse: args.applyScenarioResponse,
            projectId: args.sessionRef.current.projectId!,
            stepId,
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

export function createScenarioControllerActions(args: {
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
    ...createScenarioControllerModeActions(args),
    ...createScenarioControllerProjectActions(args),
    ...createScenarioControllerStepActions(args),
  };
}
