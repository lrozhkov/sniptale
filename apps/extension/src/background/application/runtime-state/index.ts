import { ScenarioSessionService } from '../../scenario/session-service';
import type { WebSnapshotViewerPorts } from '../../capture/page-preparation/viewer-ports';
import type { ViewportOwnerState } from '../../routing-contracts/tab-mode-state';

type ReconstructibleBackgroundRuntimeState = {
  /**
   * Rebuilt by content tabs re-requesting mode status after the MV3 service worker restarts.
   */
  highlighterModeState: Map<number, boolean>;
  quickEditModeState: Map<number, boolean>;
  screenshotModeState: Map<number, boolean>;
  viewportOwnerState: ViewportOwnerState;
  viewportState: Map<number, { width: number; height: number } | null>;
};

type DisposableBackgroundRuntimeState = {
  /**
   * Worker-local guards and ports are invalid after restart and must not survive startup.
   */
  captureGuardState: { isCapturing: boolean };
  webSnapshotViewerPorts?: WebSnapshotViewerPorts;
};

type DurableBackgroundRuntimeState = {
  /**
   * Durable owners reconcile persisted state through their own storage-backed services.
   */
  scenarioSessionService: ScenarioSessionService;
};

export type BackgroundRuntimeState = ReconstructibleBackgroundRuntimeState &
  DisposableBackgroundRuntimeState &
  DurableBackgroundRuntimeState;

function createRuntimeMap<K, V>(): Map<K, V> {
  return new Map<K, V>();
}

function createReconstructibleBackgroundRuntimeState(): ReconstructibleBackgroundRuntimeState {
  return {
    highlighterModeState: createRuntimeMap(),
    quickEditModeState: createRuntimeMap(),
    screenshotModeState: createRuntimeMap(),
    viewportOwnerState: createRuntimeMap(),
    viewportState: createRuntimeMap(),
  };
}

function createDisposableBackgroundRuntimeState(): DisposableBackgroundRuntimeState {
  return {
    captureGuardState: { isCapturing: false },
    webSnapshotViewerPorts: createRuntimeMap(),
  };
}

function createDurableBackgroundRuntimeState(): DurableBackgroundRuntimeState {
  return {
    scenarioSessionService: new ScenarioSessionService(),
  };
}

export function createBackgroundRuntimeState(): BackgroundRuntimeState {
  return {
    ...createReconstructibleBackgroundRuntimeState(),
    ...createDisposableBackgroundRuntimeState(),
    ...createDurableBackgroundRuntimeState(),
  };
}

export function reconcileBackgroundRuntimeStartupState(state: BackgroundRuntimeState): void {
  state.screenshotModeState.clear();
  state.highlighterModeState.clear();
  state.quickEditModeState.clear();
  state.viewportOwnerState.clear();
  state.viewportState.clear();
  state.captureGuardState.isCapturing = false;
  state.webSnapshotViewerPorts?.clear();
}

export function resetBackgroundRuntimeStateForLocalDataErasure(
  state: BackgroundRuntimeState
): void {
  reconcileBackgroundRuntimeStartupState(state);
  state.scenarioSessionService = new ScenarioSessionService();
}

export function clearBackgroundRuntimeTabModeState(
  state: BackgroundRuntimeState,
  tabId: number
): void {
  state.screenshotModeState.delete(tabId);
  clearBackgroundRuntimeTabEditingState(state, tabId);
  state.viewportOwnerState.delete(tabId);
  state.viewportState.delete(tabId);
  state.webSnapshotViewerPorts?.delete(tabId);
}

export function clearBackgroundRuntimeTabEditingState(
  state: BackgroundRuntimeState,
  tabId: number
): void {
  state.highlighterModeState.delete(tabId);
  state.quickEditModeState.delete(tabId);
}

export async function clearBackgroundRuntimeTabState(
  state: BackgroundRuntimeState,
  tabId: number
): Promise<void> {
  clearBackgroundRuntimeTabModeState(state, tabId);
  await state.scenarioSessionService.clearTab(tabId);
}
