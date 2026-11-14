import React from 'react';
import { GripVertical } from 'lucide-react';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { translate, type AppLocale } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { cx } from '../../chrome/ui';
import { LayerActionRail, LayerExpandedActions } from './actions';
import { LayerName, useEditableLayerName } from './editable-name';
import { useExpandedActionsVisibility } from './hover-visibility';
import { LayerPreview } from './preview';
import {
  getLayerRowClassName,
  LAYER_TRIGGER_CLASS_NAME,
  LAYER_ICON_CLASS_NAME,
  LAYER_ICON_SURFACE_CLASS_NAME,
} from './shared';
import type { EditorLayerEffectsOpenHandler } from './types';

const selectionToggleFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_42%,transparent)]';
type LayerEffectOpener = EditorLayerEffectsOpenHandler;

function getLayerSelectionClickOptions(
  event: React.MouseEvent,
  autoNavigateSelectedLayer: boolean
) {
  const additive = event.ctrlKey || event.metaKey;

  return {
    additive,
    focusViewport: autoNavigateSelectedLayer,
    range: event.shiftKey,
    toggle: additive,
  };
}

function LayerSelectionToggle({
  autoNavigateSelectedLayer,
  layer,
  onPointerStart,
  canDrag,
}: {
  onPointerStart?: (id: string, event: React.PointerEvent<HTMLButtonElement>) => void;
  canDrag: boolean;
  autoNavigateSelectedLayer: boolean;
  layer: EditorLayerItem;
}) {
  const controller = useEditorController();

  return (
    <button
      type="button"
      aria-pressed={layer.selected}
      title={translate(
        canDrag ? 'editor.toolbar.dragLayer' : 'editor.toolbar.toggleLayerSelection'
      )}
      data-ui={canDrag ? 'editor.layers.drag-handle' : 'editor.layers.selection-toggle'}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={canDrag ? (event) => onPointerStart?.(layer.id, event) : undefined}
      className={cx(
        'shrink-0 rounded-[4px] transition',
        canDrag && 'cursor-grab active:cursor-grabbing',
        selectionToggleFocusClassName
      )}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        controller.selectLayer(
          layer.id,
          getLayerSelectionClickOptions(event, autoNavigateSelectedLayer)
        );
      }}
    >
      {canDrag ? (
        <span aria-hidden className={cx(LAYER_ICON_CLASS_NAME, LAYER_ICON_SURFACE_CLASS_NAME)}>
          <GripVertical size={14} />
        </span>
      ) : (
        <LayerPreview layer={layer} />
      )}
    </button>
  );
}

function LayerTriggerContent(props: {
  editableName: ReturnType<typeof useEditableLayerName>;
  layer: EditorLayerItem;
}) {
  return (
    <span className="min-w-0 w-full flex-1 overflow-hidden">
      <LayerName layer={props.layer} editableName={props.editableName} />
    </span>
  );
}

function LayerEditingShell(props: {
  editableName: ReturnType<typeof useEditableLayerName>;
  layer: EditorLayerItem;
  triggerClassName: string;
}) {
  return (
    <div className={cx(props.triggerClassName, 'cursor-default hover:bg-transparent')}>
      <LayerTriggerContent editableName={props.editableName} layer={props.layer} />
    </div>
  );
}

function LayerButtonTrigger(props: {
  editableName: ReturnType<typeof useEditableLayerName>;
  autoNavigateSelectedLayer: boolean;
  layer: EditorLayerItem;
  triggerClassName: string;
}) {
  const controller = useEditorController();

  return (
    <button
      type="button"
      draggable={false}
      onClick={(event) =>
        controller.selectLayer(
          props.layer.id,
          getLayerSelectionClickOptions(event, props.autoNavigateSelectedLayer)
        )
      }
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          props.editableName.startEditing();
        }
      }}
      className={props.triggerClassName}
      title={props.layer.name}
    >
      <LayerTriggerContent editableName={props.editableName} layer={props.layer} />
    </button>
  );
}

function LayerTrigger(props: {
  editableName: ReturnType<typeof useEditableLayerName>;
  autoNavigateSelectedLayer: boolean;
  layer: EditorLayerItem;
}) {
  const triggerClassName = cx(
    LAYER_TRIGGER_CLASS_NAME,
    'cursor-pointer',
    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]'
  );

  if (props.editableName.editingName) {
    return (
      <LayerEditingShell
        editableName={props.editableName}
        layer={props.layer}
        triggerClassName={triggerClassName}
      />
    );
  }

  return (
    <LayerButtonTrigger
      editableName={props.editableName}
      autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
      layer={props.layer}
      triggerClassName={triggerClassName}
    />
  );
}

function LayerInlineActionsSlot(props: {
  editableName: ReturnType<typeof useEditableLayerName>;
  expandedActionsVisible: boolean;
  autoNavigateSelectedLayer: boolean;
  isImmutable: boolean;
  layer: EditorLayerItem;
  onOpenLayerEffects: LayerEffectOpener;
}) {
  return (
    <div className="flex min-w-0 w-full items-center overflow-hidden">
      <LayerTrigger
        editableName={props.editableName}
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
        layer={props.layer}
      />
      <LayerExpandedActions
        isImmutable={props.isImmutable}
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
        editingName={props.editableName.editingName}
        layer={props.layer}
        visible={props.expandedActionsVisible}
        onOpenLayerEffects={props.onOpenLayerEffects}
      />
    </div>
  );
}

export const LayerRow = React.memo(function LayerRow(props: {
  layer: EditorLayerItem;
  // The list's single locale subscription invalidates every memoized row.
  locale: AppLocale;
  draggedLayerId?: string | null;
  dragBlocked?: boolean;
  onPointerStart?: (id: string, event: React.PointerEvent<HTMLButtonElement>) => void;
  autoNavigateSelectedLayer?: boolean;
  onOpenLayerEffects: LayerEffectOpener;
}) {
  const isImmutable = Boolean(props.layer.immutable);
  const isDragDisabled = !props.layer.reorderable && (isImmutable || props.layer.locked);
  const editableName = useEditableLayerName(props.layer);
  const expandedActionsVisibility = useExpandedActionsVisibility();

  return (
    <div
      key={props.layer.id}
      data-editor-layer-id={props.layer.id}
      data-parent-context={
        props.layer.containsSelection && !props.layer.selected ? true : undefined
      }
      onMouseEnter={expandedActionsVisibility.showExpandedActions}
      onMouseLeave={expandedActionsVisibility.hideExpandedActions}
      data-dragging={props.draggedLayerId === props.layer.id || undefined}
      className={cx(
        getLayerRowClassName(props.layer, null, isImmutable),
        props.draggedLayerId === props.layer.id &&
          'z-20 !border-[color:var(--sniptale-color-border-strong)] ' +
            '!bg-[color:var(--sniptale-color-surface-hover)] ring-1 ring-inset ' +
            'ring-[var(--sniptale-color-border-strong)]'
      )}
    >
      <LayerSelectionToggle
        canDrag={props.layer.selected && !isDragDisabled && !props.dragBlocked}
        {...(props.onPointerStart ? { onPointerStart: props.onPointerStart } : {})}
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer === true}
        layer={props.layer}
      />
      <LayerInlineActionsSlot
        editableName={editableName}
        expandedActionsVisible={
          !props.draggedLayerId && expandedActionsVisibility.expandedActionsVisible
        }
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer === true}
        isImmutable={isImmutable}
        layer={props.layer}
        onOpenLayerEffects={props.onOpenLayerEffects}
      />
      <LayerActionRail layer={props.layer} />
    </div>
  );
});
