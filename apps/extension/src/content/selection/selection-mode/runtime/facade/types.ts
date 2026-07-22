import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import type { SelectionModeSession } from '../../session';
import type { createSelectionModeUiRuntime } from '../../ui/runtime';

type SelectionModeRuntimeFacadeSession = Pick<
  SelectionModeSession,
  | 'aspectRatio'
  | 'currentSelection'
  | 'currentState'
  | 'cursorStyleCleanup'
  | 'dom'
  | 'isActive'
  | 'maintainAspectRatio'
  | 'rejectCallback'
  | 'resolveCallback'
>;

export interface SelectionModeRuntimeFacadeArgs {
  session: SelectionModeRuntimeFacadeSession;
  getMaxSelectionHeight: typeof import('../../constants').getMaxSelectionHeight;
  getMaxSelectionWidth: typeof import('../../constants').getMaxSelectionWidth;
  cleanup: () => void;
  cancelSelection: () => void;
  confirmSelection: () => void;
  resetToIdleState: () => void;
  setupRuntimeListeners: () => void;
  updateFinalFrame: () => void;
  constrainSelection: () => void;
}

export interface SelectionModePublicApiArgs {
  cleanup: () => void;
  setupRuntimeListeners: () => void;
  session: Pick<
    SelectionModeRuntimeFacadeSession,
    'currentState' | 'cursorStyleCleanup' | 'isActive' | 'rejectCallback' | 'resolveCallback'
  >;
  uiRuntime: ReturnType<typeof createSelectionModeUiRuntime>;
}

export interface SelectionModeRuntimeFacade {
  disableCursor: () => void;
  disableSelectionMode: () => void;
  enableSelectionMode: () => Promise<CaptureArea>;
  isSelectionModeActive: () => boolean;
  setupSizePanelListeners: () => void;
  uiRuntime: ReturnType<typeof createSelectionModeUiRuntime>;
  zIndexBase: number;
}
