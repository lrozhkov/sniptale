import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import type { CaptureActionType } from '../../../../contracts/settings';
import type { SelectionModeSession } from '../session';
import {
  createDragFrame as createDragFrameDom,
  createFinalElements as createFinalElementsDom,
  createHoverElements as createHoverElementsDom,
  createOverlayContainer as createOverlayContainerDom,
} from '.';

type SelectionModeUiRuntimeConfig = {
  getDom: () => SelectionModeSession['dom'];
  getCaptureAction: () => CaptureActionType;
  getSelection: () => SelectionModeSession['currentSelection'];
  getVisual: () => ResolvedBorderPresetVisual;
  getMaxSelectionHeight: () => number;
  getMaxSelectionWidth: () => number;
  minSelectionSize: number;
  onCancel: () => void;
  onAdjustPadding: (direction: 'decrease' | 'increase') => void;
  onCaptureActionChange: (action: CaptureActionType) => void;
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
    getCaptureAction: config.getCaptureAction,
    getSelection: config.getSelection,
    onAdjustPadding: config.onAdjustPadding,
    onCaptureActionChange: config.onCaptureActionChange,
    onCancel: config.onCancel,
    onConfirm: config.onConfirm,
    onResetToIdle: config.onResetToIdle,
    onSetupSizePanelListeners: config.onSetupSizePanelListeners,
  };
}

export function createSelectionModeUiRuntime(config: SelectionModeUiRuntimeConfig) {
  return {
    prepare: () => config.prepareVisual(),
    createDragFrame: () => {
      createDragFrameDom(config.getDom(), config.getVisual());
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
        overlayBackground: config.overlayBackground,
        zIndexBase: config.zIndexBase,
      });
    },
  };
}
