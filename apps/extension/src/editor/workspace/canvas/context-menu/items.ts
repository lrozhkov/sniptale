import type { EditorLayerItem } from '../../../../features/editor/document/types';
import { translate } from '../../../../platform/i18n';
import { fireAndReportEditorAction } from '../../../runtime/async-actions';
import {
  canDeleteLayerSelection,
  canDuplicateLayerSelection,
  canMergeLayerSelection,
  canReorderLayerSelection,
} from '../../../inspector/layers/helpers';
import type {
  CanvasContextMenuController,
  CanvasContextMenuItem,
  CanvasContextMenuRequest,
} from './types';
import {
  buildArrangeItems,
  buildTransformItems,
  buildViewItems,
  withMenuClose,
} from './submenu-items';

function withEllipsis(label: string) {
  return `${label}…`;
}

function buildNoImageItems(onOpenImage: () => void, onClose: () => void): CanvasContextMenuItem[] {
  return [
    withMenuClose(
      {
        id: 'open-image',
        label: withEllipsis(translate('editor.toolbar.openImage')),
        onSelect: () => onOpenImage(),
      },
      onClose
    ),
  ];
}

function buildBlankItems(
  controller: CanvasContextMenuController,
  onClose: () => void,
  onOpenImage: () => void
): CanvasContextMenuItem[] {
  return [
    withMenuClose(
      {
        id: 'insert-image',
        label: withEllipsis(translate('editor.toolbar.insertImage')),
        onSelect: () => onOpenImage(),
      },
      onClose
    ),
    {
      id: 'view',
      items: buildViewItems(controller, onClose),
      label: translate('editor.toolbar.contextMenuView'),
      type: 'submenu',
    },
  ];
}

function buildMultiItems(
  controller: CanvasContextMenuController,
  enabledSnapshot: ReturnType<typeof resolveCanvasContextMenuEnabledSnapshot>,
  onClose: () => void
): CanvasContextMenuItem[] {
  return [
    withMenuClose(
      {
        disabled: !enabledSnapshot.canDuplicate,
        id: 'duplicate-selection',
        label: translate('editor.toolbar.duplicateLayer'),
        onSelect: () =>
          fireAndReportEditorAction('canvas-context-menu:duplicate-selection', () =>
            controller.duplicateSelection()
          ),
      },
      onClose
    ),
    withMenuClose(
      {
        disabled: !enabledSnapshot.canMerge,
        id: 'merge-layers',
        label: translate('editor.toolbar.mergeLayers'),
        onSelect: () =>
          fireAndReportEditorAction('canvas-context-menu:merge-layers', () =>
            controller.mergeSelectedLayers()
          ),
      },
      onClose
    ),
    {
      id: 'arrange',
      items: buildArrangeItems(controller, !enabledSnapshot.canReorder, onClose),
      label: translate('editor.toolbar.contextMenuArrange'),
      type: 'submenu',
    },
    { id: 'divider-delete', type: 'divider' },
    withMenuClose(
      {
        danger: true,
        disabled: !enabledSnapshot.canDelete,
        id: 'delete-selection',
        label: translate('editor.toolbar.deleteLayer'),
        onSelect: () => controller.deleteSelection(),
      },
      onClose
    ),
  ];
}

function buildSingleItems(
  controller: CanvasContextMenuController,
  enabledSnapshot: ReturnType<typeof resolveCanvasContextMenuEnabledSnapshot>,
  onClose: () => void,
  request: CanvasContextMenuRequest
): CanvasContextMenuItem[] {
  const singleLayerId = request.layer?.id ?? '';

  return [
    ...buildSinglePrimaryItems(controller, enabledSnapshot, onClose),
    ...buildSingleLayerStateItems(controller, onClose, request),
    {
      id: 'transform',
      items: buildTransformItems(
        controller,
        singleLayerId,
        Boolean(request.layer?.locked),
        onClose
      ),
      label: translate('editor.toolbar.contextMenuTransform'),
      type: 'submenu',
    },
    ...buildSingleDeleteItems(controller, enabledSnapshot, onClose),
  ];
}

function buildSinglePrimaryItems(
  controller: CanvasContextMenuController,
  enabledSnapshot: ReturnType<typeof resolveCanvasContextMenuEnabledSnapshot>,
  onClose: () => void
): CanvasContextMenuItem[] {
  return [
    withMenuClose(
      {
        disabled: !enabledSnapshot.canDuplicate,
        id: 'duplicate-layer',
        label: translate('editor.toolbar.duplicateLayer'),
        onSelect: () =>
          fireAndReportEditorAction('canvas-context-menu:duplicate-layer', () =>
            controller.duplicateSelection()
          ),
      },
      onClose
    ),
    {
      id: 'arrange',
      items: buildArrangeItems(controller, !enabledSnapshot.canReorder, onClose),
      label: translate('editor.toolbar.contextMenuArrange'),
      type: 'submenu',
    },
  ];
}

function buildSingleLayerStateItems(
  controller: CanvasContextMenuController,
  onClose: () => void,
  request: CanvasContextMenuRequest
): CanvasContextMenuItem[] {
  return [
    withMenuClose(
      {
        disabled: Boolean(request.layer?.locked),
        id: 'toggle-visibility',
        label: translate(
          request.layer?.visible === false ? 'editor.toolbar.showLayer' : 'editor.toolbar.hideLayer'
        ),
        onSelect: () => {
          if (request.layer) {
            controller.toggleLayerVisibility(request.layer.id);
          }
        },
      },
      onClose
    ),
    withMenuClose(
      {
        id: 'toggle-lock',
        label: translate(
          request.layer?.locked ? 'editor.toolbar.unlockLayer' : 'editor.toolbar.lockLayer'
        ),
        onSelect: () => {
          if (request.layer) {
            controller.toggleLayerLock(request.layer.id);
          }
        },
      },
      onClose
    ),
  ];
}

function buildSingleDeleteItems(
  controller: CanvasContextMenuController,
  enabledSnapshot: ReturnType<typeof resolveCanvasContextMenuEnabledSnapshot>,
  onClose: () => void
): CanvasContextMenuItem[] {
  return [
    { id: 'divider-delete', type: 'divider' },
    withMenuClose(
      {
        danger: true,
        disabled: !enabledSnapshot.canDelete,
        id: 'delete-layer',
        label: translate('editor.toolbar.deleteLayer'),
        onSelect: () => controller.deleteSelection(),
      },
      onClose
    ),
  ];
}

export function resolveCanvasContextMenuEnabledSnapshot(
  layers: EditorLayerItem[],
  request: CanvasContextMenuRequest
) {
  const normalizedLayers =
    request.kind === 'single' && request.layer
      ? layers.map((layer) => ({
          ...layer,
          selected: layer.id === request.layer?.id,
        }))
      : request.kind === 'blank' || request.kind === 'no-image'
        ? layers.map((layer) => ({
            ...layer,
            selected: false,
          }))
        : layers;

  return {
    canDelete: canDeleteLayerSelection(normalizedLayers),
    canDuplicate: canDuplicateLayerSelection(normalizedLayers),
    canMerge: canMergeLayerSelection(normalizedLayers),
    canReorder: canReorderLayerSelection(normalizedLayers),
  };
}

export function buildCanvasContextMenuItems(args: {
  controller: CanvasContextMenuController;
  enabledSnapshot: ReturnType<typeof resolveCanvasContextMenuEnabledSnapshot>;
  onClose: () => void;
  onOpenImage: () => void;
  request: CanvasContextMenuRequest;
}): CanvasContextMenuItem[] {
  const { controller, enabledSnapshot, onClose, onOpenImage, request } = args;

  switch (request.kind) {
    case 'no-image':
      return buildNoImageItems(onOpenImage, onClose);
    case 'blank':
      return buildBlankItems(controller, onClose, onOpenImage);
    case 'multi':
      return buildMultiItems(controller, enabledSnapshot, onClose);
    case 'single':
      return buildSingleItems(controller, enabledSnapshot, onClose, request);
  }
}
