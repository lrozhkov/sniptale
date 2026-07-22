import { MIN_SELECTION_SIZE } from '../../constants';
import type { SelectionModeSession } from '../../session';
import { setupSelectionModeSizePanelListeners } from './index';

export function createSelectionModeSizePanelSetup(args: {
  constrainSelection: () => void;
  getMaxSelectionHeight: typeof import('../../constants').getMaxSelectionHeight;
  getMaxSelectionWidth: typeof import('../../constants').getMaxSelectionWidth;
  session: Pick<
    SelectionModeSession,
    'aspectRatio' | 'currentSelection' | 'dom' | 'maintainAspectRatio'
  >;
  updateFinalFrame: () => void;
}): () => void {
  return () => {
    setupSelectionModeSizePanelListeners({
      constrainSelection: args.constrainSelection,
      dom: args.session.dom,
      getAspectRatio: () => args.session.aspectRatio,
      getCurrentSelection: () => args.session.currentSelection,
      getMaintainAspectRatio: () => args.session.maintainAspectRatio,
      getMaxSelectionHeight: args.getMaxSelectionHeight,
      getMaxSelectionWidth: args.getMaxSelectionWidth,
      minSelectionSize: MIN_SELECTION_SIZE,
      setAspectRatio: (value) => {
        args.session.aspectRatio = value;
      },
      setCurrentSelection: (value) => {
        args.session.currentSelection = value;
      },
      setMaintainAspectRatio: (value) => {
        args.session.maintainAspectRatio = value;
      },
      updateFinalFrame: args.updateFinalFrame,
    });
  };
}
