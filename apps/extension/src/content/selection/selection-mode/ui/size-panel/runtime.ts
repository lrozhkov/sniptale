import { MIN_SELECTION_SIZE } from '../../constants';
import type { SelectionModeState } from '../../session/state';
import { setupSelectionModeSizePanelListeners } from './index';

export function createSelectionModeSizePanelSetup(args: {
  constrainSelection: () => void;
  state: SelectionModeState;
  getAspectRatio: () => number | null;
  getCurrentSelection: () => SelectionModeState['currentSelection'];
  getMaintainAspectRatio: () => boolean;
  getMaxSelectionHeight: typeof import('../../constants').getMaxSelectionHeight;
  getMaxSelectionWidth: typeof import('../../constants').getMaxSelectionWidth;
  setAspectRatio: (value: number | null) => void;
  setCurrentSelection: (value: SelectionModeState['currentSelection']) => void;
  setMaintainAspectRatio: (value: boolean) => void;
  updateFinalFrame: () => void;
}): () => void {
  return () => {
    setupSelectionModeSizePanelListeners({
      constrainSelection: args.constrainSelection,
      dom: args.state.dom,
      getAspectRatio: args.getAspectRatio,
      getCurrentSelection: args.getCurrentSelection,
      getMaintainAspectRatio: args.getMaintainAspectRatio,
      getMaxSelectionHeight: args.getMaxSelectionHeight,
      getMaxSelectionWidth: args.getMaxSelectionWidth,
      minSelectionSize: MIN_SELECTION_SIZE,
      setAspectRatio: args.setAspectRatio,
      setCurrentSelection: args.setCurrentSelection,
      setMaintainAspectRatio: args.setMaintainAspectRatio,
      updateFinalFrame: args.updateFinalFrame,
    });
  };
}
