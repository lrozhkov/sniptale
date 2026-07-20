import { translate } from '../../../../platform/i18n';
import { fireAndReportEditorAction } from '../../../runtime/async-actions';
import type { CanvasContextMenuActionItem, CanvasContextMenuController } from './types';

function withClose(
  item: Omit<CanvasContextMenuActionItem, 'onSelect'> & { onSelect: () => void },
  onClose: () => void
): CanvasContextMenuActionItem {
  return {
    ...item,
    onSelect: () => {
      onClose();
      item.onSelect();
    },
  };
}

export function withMenuClose(
  item: Omit<CanvasContextMenuActionItem, 'onSelect'> & { onSelect: () => void },
  onClose: () => void
) {
  return withClose(item, onClose);
}

export function buildArrangeItems(
  controller: CanvasContextMenuController,
  disabled: boolean,
  onClose: () => void
) {
  return [
    withClose(
      {
        disabled,
        id: 'bring-to-front',
        label: translate('editor.toolbar.frontLayer'),
        onSelect: () => controller.bringSelectionToFront(),
      },
      onClose
    ),
    withClose(
      {
        disabled,
        id: 'bring-forward',
        label: translate('editor.toolbar.raiseSelection'),
        onSelect: () => controller.bringForwardSelection(),
      },
      onClose
    ),
    withClose(
      {
        disabled,
        id: 'send-backward',
        label: translate('editor.toolbar.lowerSelection'),
        onSelect: () => controller.sendBackwardSelection(),
      },
      onClose
    ),
    withClose(
      {
        disabled,
        id: 'send-to-back',
        label: translate('editor.toolbar.backLayer'),
        onSelect: () => controller.sendSelectionToBack(),
      },
      onClose
    ),
  ];
}

function createTransformAction(
  actionId: 'flip-horizontal' | 'flip-vertical' | 'rotate-left' | 'rotate-right',
  labelKey:
    | 'editor.layerEffects.flipHorizontal'
    | 'editor.layerEffects.flipVertical'
    | 'editor.layerEffects.rotateLeft'
    | 'editor.layerEffects.rotateRight',
  controller: CanvasContextMenuController,
  layerId: string,
  disabled: boolean,
  onClose: () => void
) {
  return withClose(
    {
      disabled,
      id: actionId,
      label: translate(labelKey),
      onSelect: () =>
        fireAndReportEditorAction(`canvas-context-menu:${actionId}`, () =>
          controller.applyLayerTransformation(layerId, actionId)
        ),
    },
    onClose
  );
}

export function buildTransformItems(
  controller: CanvasContextMenuController,
  layerId: string,
  disabled: boolean,
  onClose: () => void
) {
  return [
    createTransformAction(
      'flip-horizontal',
      'editor.layerEffects.flipHorizontal',
      controller,
      layerId,
      disabled,
      onClose
    ),
    createTransformAction(
      'flip-vertical',
      'editor.layerEffects.flipVertical',
      controller,
      layerId,
      disabled,
      onClose
    ),
    createTransformAction(
      'rotate-left',
      'editor.layerEffects.rotateLeft',
      controller,
      layerId,
      disabled,
      onClose
    ),
    createTransformAction(
      'rotate-right',
      'editor.layerEffects.rotateRight',
      controller,
      layerId,
      disabled,
      onClose
    ),
  ];
}

export function buildViewItems(controller: CanvasContextMenuController, onClose: () => void) {
  return [
    withClose(
      {
        id: 'fit-to-window',
        label: translate('editor.toolbar.fitToWindow'),
        onSelect: () => controller.zoomToFit(),
      },
      onClose
    ),
    withClose(
      {
        id: 'zoom-reset',
        label: translate('editor.toolbar.resetZoomPrefix'),
        onSelect: () => controller.resetZoom(),
      },
      onClose
    ),
    withClose(
      {
        id: 'zoom-in',
        label: translate('editor.toolbar.zoomIn'),
        onSelect: () => controller.zoomIn(),
      },
      onClose
    ),
    withClose(
      {
        id: 'zoom-out',
        label: translate('editor.toolbar.zoomOut'),
        onSelect: () => controller.zoomOut(),
      },
      onClose
    ),
  ];
}
