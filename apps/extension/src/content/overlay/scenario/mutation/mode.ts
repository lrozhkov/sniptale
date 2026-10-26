import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import {
  setScenarioCaptureMode,
  setScenarioEnabled,
  setScenarioRememberSelection,
  setScenarioSidebarVisible,
  updateScenarioSurfaceState,
} from '../runtime/transport/session';
import type { ScenarioControllerResponse } from '../types';
import { restoreNavigationLockState } from '../../screenshot/bridge';
import { translate } from '../../../../platform/i18n';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';

export async function applyScenarioRecorderPanelVisibility(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  currentSession: ScenarioSessionState;
  currentSurface: ScenarioRecorderSurfaceState;
  refreshSession: () => Promise<void>;
  screenshotMode: boolean;
  visible: boolean;
}): Promise<boolean> {
  if (!args.visible) {
    return applyScenarioEnabledState({
      applyScenarioResponse: args.applyScenarioResponse,
      enabled: false,
    });
  }
  if (args.currentSession.enabled) {
    return applyScenarioSidebarVisibility({
      applyScenarioResponse: args.applyScenarioResponse,
      sidebarVisible: args.visible,
    });
  }

  const baselineSurface: ScenarioRecorderSurfaceState = {
    ...args.currentSurface,
    screenshotMode: args.screenshotMode,
    toolbarVisible: true,
  };
  try {
    await requireScenarioPanelResponse(updateScenarioSurfaceState(baselineSurface));
    await requireScenarioPanelResponse(setScenarioSidebarVisible(true));
    const response = await requireScenarioPanelResponse(setScenarioEnabled(true));
    args.applyScenarioResponse(response);
    return true;
  } catch {
    try {
      await requireScenarioPanelResponse(updateScenarioSurfaceState(baselineSurface));
      await requireScenarioPanelResponse(
        setScenarioSidebarVisible(args.currentSession.sidebarVisible)
      );
      await requireScenarioPanelResponse(setScenarioEnabled(args.currentSession.enabled));
      await args.refreshSession();
    } catch {
      // A failed compensation must not hide the usable toolbar through an older stored snapshot.
    }
    showToast(translate('common.errors.saveFailed'), 'error');
    return false;
  }
}

async function requireScenarioPanelResponse(request: Promise<ScenarioControllerResponse>) {
  const response = await request;
  if (!response?.success) throw new Error('Scenario panel state change failed');
  return response;
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

  let response: Awaited<ReturnType<typeof setScenarioCaptureMode>> | null;
  try {
    response = await setScenarioCaptureMode(args.captureMode);
  } catch {
    response = null;
  }
  if (response?.success) {
    args.applyScenarioResponse(response);
    return;
  }

  args.setOptimisticCaptureMode(null);
  if (args.captureMode === 'by-click' && args.screenshotMode) {
    restoreNavigationLockState(args.navigationLockEnabled, args.setNavigationLockEnabled);
  }
  showToast(translate('scenario.content.captureModeError'), 'error');
}

export async function applyScenarioEnabledState(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  enabled: boolean;
}) {
  try {
    const response = await setScenarioEnabled(args.enabled);
    if (response?.success) {
      args.applyScenarioResponse(response);
      return true;
    }
  } catch {
    // Retain the last accepted session when the transport cannot commit the change.
  }
  showToast(translate('common.errors.saveFailed'), 'error');
  return false;
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
  try {
    const response = await setScenarioSidebarVisible(args.sidebarVisible);
    if (response?.success) {
      args.applyScenarioResponse(response);
      return true;
    }
  } catch {
    // Retain the visible state until the session owner accepts a replacement.
  }
  showToast(translate('common.errors.saveFailed'), 'error');
  return false;
}

export async function applyScenarioScreenshotModeDisabled(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  currentSurface: ScenarioRecorderSurfaceState;
}) {
  const surfaceResponse = await updateScenarioSurfaceState({
    ...args.currentSurface,
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
