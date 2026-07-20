import { MIN_SELECTION_SIZE, OVERLAY_BACKGROUND, Z_INDEX_BASE } from '../../constants';
import { getSelectionFrameVisual } from '../../../frame-runtime/selection-frame-visual';
import { createSelectionModeUiRuntime } from '../../ui/runtime';

export function createSelectionModeFacadeUi(args: {
  getDom: () => ReturnType<typeof import('../../session/state').createSelectionModeState>['dom'];
  getMaxSelectionHeight: typeof import('../../constants').getMaxSelectionHeight;
  getMaxSelectionWidth: typeof import('../../constants').getMaxSelectionWidth;
  cancelSelection: () => void;
  confirmSelection: () => void;
  resetToIdleState: () => void;
  onSetupSizePanelListeners: () => void;
}) {
  const currentVisual = getSelectionFrameVisual();

  return createSelectionModeUiRuntime({
    getDom: args.getDom,
    getVisual: () => currentVisual,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    minSelectionSize: MIN_SELECTION_SIZE,
    onCancel: args.cancelSelection,
    onConfirm: args.confirmSelection,
    onResetToIdle: args.resetToIdleState,
    onSetupSizePanelListeners: args.onSetupSizePanelListeners,
    overlayBackground: OVERLAY_BACKGROUND,
    prepareVisual: async () => {},
    zIndexBase: Z_INDEX_BASE,
  });
}
