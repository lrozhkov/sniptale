import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import type { SelectionModeState } from '../session/state';
import {
  createDragFrame as createDragFrameDom,
  createFinalElements as createFinalElementsDom,
  createHoverElements as createHoverElementsDom,
  createOverlayContainer as createOverlayContainerDom,
} from '.';

type SelectionModeUiRuntimeConfig = {
  getDom: () => SelectionModeState['dom'];
  getVisual: () => ResolvedBorderPresetVisual;
  getMaxSelectionHeight: () => number;
  getMaxSelectionWidth: () => number;
  minSelectionSize: number;
  onCancel: () => void;
  onConfirm: () => void;
  onResetToIdle: () => void;
  onSetupSizePanelListeners: () => void;
  overlayBackground: string;
  prepareVisual: () => Promise<void>;
  zIndexBase: number;
};

function createFinalElementsOptions(config: SelectionModeUiRuntimeConfig) {
  return {
    zIndexBase: config.zIndexBase,
    overlayBackground: config.overlayBackground,
    visual: config.getVisual(),
    minSelectionSize: config.minSelectionSize,
    getMaxSelectionWidth: config.getMaxSelectionWidth,
    getMaxSelectionHeight: config.getMaxSelectionHeight,
    onConfirm: config.onConfirm,
    onResetToIdle: config.onResetToIdle,
    onSetupSizePanelListeners: config.onSetupSizePanelListeners,
  };
}

export function createSelectionModeUiRuntime(config: SelectionModeUiRuntimeConfig) {
  return {
    prepare: () => config.prepareVisual(),
    createDragFrame: () => {
      createDragFrameDom(config.getDom(), config.getVisual(), config.overlayBackground);
    },

    createFinalElements: () => {
      createFinalElementsDom(config.getDom(), createFinalElementsOptions(config));
    },

    createHoverElements: () => {
      createHoverElementsDom(config.getDom(), config.getVisual(), config.zIndexBase);
    },

    createOverlayContainer: () => {
      createOverlayContainerDom(config.getDom(), {
        cancelSelection: config.onCancel,
        zIndexBase: config.zIndexBase,
      });
    },
  };
}
