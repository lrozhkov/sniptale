import type { CaptureActionType } from '../../../../contracts/settings';
import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';
import {
  setScenarioCaptureMode,
  setScenarioEnabled,
  setScenarioRememberSelection,
  setScenarioSidebarVisible,
  updateScenarioSurfaceState,
} from '../runtime/transport/session';
import type { ScenarioControllerResponse } from '../types';
import { restoreNavigationLockState } from '../../screenshot/bridge';

export async function applyScenarioCaptureAction(args: {
  actionType: CaptureActionType;
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  currentSurface: ScenarioRecorderSurfaceState;
}) {
  const enabled = args.actionType === 'scenario';
  const nextSurface: ScenarioRecorderSurfaceState = {
    ...args.currentSurface,
    captureAction: args.actionType,
    screenshotMode: enabled ? true : args.currentSurface.screenshotMode,
    toolbarVisible: enabled ? true : args.currentSurface.toolbarVisible,
  };
  const surfaceResponse = await updateScenarioSurfaceState(nextSurface);
  if (!surfaceResponse?.success) {
    return;
  }

  args.applyScenarioResponse(surfaceResponse);
  const response = await setScenarioEnabled(enabled);
  if (response?.success) {
    args.applyScenarioResponse(response);
    return;
  }

  const rollbackResponse = await updateScenarioSurfaceState(args.currentSurface);
  if (rollbackResponse?.success) {
    args.applyScenarioResponse(rollbackResponse);
  }
}

export async function applyScenarioCaptureMode(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  captureMode: ScenarioCaptureMode;
  navigationLockEnabled: boolean;
  screenshotMode: boolean;
  setNavigationLockEnabled: (enabled: boolean) => void;
  setOptimisticCaptureMode: (captureMode: ScenarioCaptureMode | null) => void;
}) {
  args.setOptimisticCaptureMode(args.captureMode);
  if (args.captureMode === 'by-click' && args.screenshotMode) {
    restoreNavigationLockState(false, args.setNavigationLockEnabled);
  }

  const response = await setScenarioCaptureMode(args.captureMode);
  if (response?.success) {
    args.applyScenarioResponse(response);
    return;
  }

  args.setOptimisticCaptureMode(null);
  if (args.captureMode === 'by-click' && args.screenshotMode) {
    restoreNavigationLockState(args.navigationLockEnabled, args.setNavigationLockEnabled);
  }
}

export async function applyScenarioEnabledState(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  enabled: boolean;
}) {
  const response = await setScenarioEnabled(args.enabled);
  if (response?.success) {
    args.applyScenarioResponse(response);
  }
}

export async function applyScenarioRememberSelection(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  rememberProjectSelection: boolean;
}) {
  const response = await setScenarioRememberSelection(args.rememberProjectSelection);
  if (response?.success) {
    args.applyScenarioResponse(response);
  }
}

export async function applyScenarioSidebarVisibility(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  sidebarVisible: boolean;
}) {
  const response = await setScenarioSidebarVisible(args.sidebarVisible);
  if (response?.success) {
    args.applyScenarioResponse(response);
  }
}

export async function applyScenarioScreenshotModeDisabled(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  currentSurface: ScenarioRecorderSurfaceState;
}) {
  const surfaceResponse = await updateScenarioSurfaceState({
    ...args.currentSurface,
    captureAction: 'download_default',
    screenshotMode: false,
    toolbarVisible: false,
  });
  if (surfaceResponse?.success) {
    args.applyScenarioResponse(surfaceResponse);
  }

  await applyScenarioSidebarVisibility({
    applyScenarioResponse: args.applyScenarioResponse,
    sidebarVisible: false,
  });
  await applyScenarioEnabledState({
    applyScenarioResponse: args.applyScenarioResponse,
    enabled: false,
  });
}
