import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import type { SelectionModeSession } from '../../session';
import type { createSelectionModeUiRuntime } from '../../ui/runtime';

interface SelectionModeRuntimeFacadeSetupArgs {
  state: ReturnType<typeof import('../../session').createSelectionModeSession>;
  getMaxSelectionHeight: typeof import('../../constants').getMaxSelectionHeight;
  getMaxSelectionWidth: typeof import('../../constants').getMaxSelectionWidth;
  cleanup: () => void;
  cancelSelection: () => void;
  confirmSelection: () => void;
  resetToIdleState: () => void;
  setupRuntimeListeners: () => void;
}

interface SelectionModeRuntimeFacadeStateArgs {
  getIsActive: () => boolean;
  getRejectCallback: () => SelectionModeSession['rejectCallback'];
  setIsActive: (value: boolean) => void;
  setCurrentState: (value: SelectionModeSession['currentState']) => void;
  setRejectCallback: (value: SelectionModeSession['rejectCallback']) => void;
  setResolveCallback: (value: ((value: CaptureArea) => void) | null) => void;
  setAspectRatio: (value: number | null) => void;
  setCurrentSelection: (value: SelectionModeSession['currentSelection']) => void;
  setMaintainAspectRatio: (value: boolean) => void;
}

interface SelectionModeRuntimeFacadeViewArgs {
  getDom: () => SelectionModeSession['dom'];
  getAspectRatio: () => number | null;
  getCurrentSelection: () => SelectionModeSession['currentSelection'];
  getMaintainAspectRatio: () => boolean;
  updateFinalFrame: () => void;
  constrainSelection: () => void;
}

export interface SelectionModePublicApiArgs extends SelectionModeRuntimeFacadeStateArgs {
  cleanup: () => void;
  setupRuntimeListeners: () => void;
  state: SelectionModeRuntimeFacadeSetupArgs['state'];
  uiRuntime: ReturnType<typeof createSelectionModeUiRuntime>;
}

export type SelectionModeRuntimeFacadeArgs = SelectionModeRuntimeFacadeSetupArgs &
  SelectionModeRuntimeFacadeStateArgs &
  SelectionModeRuntimeFacadeViewArgs;

export interface SelectionModeRuntimeFacade {
  disableCursor: () => void;
  disableSelectionMode: () => void;
  enableSelectionMode: () => Promise<CaptureArea>;
  isSelectionModeActive: () => boolean;
  setupSizePanelListeners: () => void;
  uiRuntime: ReturnType<typeof createSelectionModeUiRuntime>;
  zIndexBase: number;
}
