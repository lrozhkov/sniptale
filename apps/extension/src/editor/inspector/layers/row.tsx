import React from 'react';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { cx } from '../../chrome/ui';
import { LayerActionRail, LayerExpandedActions } from './actions';
import { LayerName, useEditableLayerName } from './editable-name';
import { useExpandedActionsVisibility } from './hover-visibility';
import { LayerPreview } from './preview';
import { getLayerRowClassName, LAYER_TRIGGER_CLASS_NAME } from './shared';
import type { EditorLayerEffectsOpenHandler } from './types';

const selectionToggleFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_42%,transparent)]';
type LayerEffectOpener = EditorLayerEffectsOpenHandler;
type LayerButtonDragHandlers = Pick<
  ReturnType<typeof createLayerDragHandlers>,
  'onDragEnd' | 'onDragStart'
>;

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
}: {
  autoNavigateSelectedLayer: boolean;
  layer: EditorLayerItem;
}) {
  const controller = useEditorController();

  return (
    <button
      type="button"
      aria-pressed={layer.selected}
      title={translate('editor.toolbar.toggleLayerSelection')}
      className={cx(
        'shrink-0 rounded-[10px] transition',
        layer.selected &&
          'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
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
      <LayerPreview layer={layer} />
    </button>
  );
}

function LayerTriggerContent(props: {
  editableName: ReturnType<typeof useEditableLayerName>;
  hidden: boolean;
  layer: EditorLayerItem;
}) {
  return (
    <span
      className={cx(
        'min-w-0 w-full flex-1 overflow-hidden',
        props.hidden && 'pointer-events-none opacity-0'
      )}
    >
      <LayerName layer={props.layer} editableName={props.editableName} />
    </span>
  );
}

function LayerEditingShell(props: {
  editableName: ReturnType<typeof useEditableLayerName>;
  hidden: boolean;
  layer: EditorLayerItem;
  triggerClassName: string;
}) {
  return (
    <div className={cx(props.triggerClassName, 'cursor-default hover:bg-transparent')}>
      <LayerTriggerContent
        editableName={props.editableName}
        hidden={props.hidden}
        layer={props.layer}
      />
    </div>
  );
}

function LayerButtonTrigger(props: {
  dragHandlers: LayerButtonDragHandlers;
  editableName: ReturnType<typeof useEditableLayerName>;
  hidden: boolean;
  autoNavigateSelectedLayer: boolean;
  isImmutable: boolean;
  layer: EditorLayerItem;
  triggerClassName: string;
}) {
  const controller = useEditorController();

  return (
    <button
      type="button"
      draggable={!props.isImmutable}
      onDragStart={props.dragHandlers.onDragStart}
      onDragEnd={props.dragHandlers.onDragEnd}
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
      className={cx(props.triggerClassName, props.hidden && 'pointer-events-none')}
      title={props.layer.name}
    >
      <LayerTriggerContent
        editableName={props.editableName}
        hidden={props.hidden}
        layer={props.layer}
      />
    </button>
  );
}

function LayerTrigger(props: {
  dragHandlers: LayerButtonDragHandlers;
  editableName: ReturnType<typeof useEditableLayerName>;
  hidden: boolean;
  autoNavigateSelectedLayer: boolean;
  isImmutable: boolean;
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
        hidden={props.hidden}
        layer={props.layer}
        triggerClassName={triggerClassName}
      />
    );
  }

  return (
    <LayerButtonTrigger
      dragHandlers={props.dragHandlers}
      editableName={props.editableName}
      hidden={props.hidden}
      autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
      isImmutable={props.isImmutable}
      layer={props.layer}
      triggerClassName={triggerClassName}
    />
  );
}

function LayerInlineActionsSlot(props: {
  dragHandlers: LayerButtonDragHandlers;
  editableName: ReturnType<typeof useEditableLayerName>;
  expandedActionsVisible: boolean;
  autoNavigateSelectedLayer: boolean;
  isImmutable: boolean;
  layer: EditorLayerItem;
  onOpenLayerEffects: LayerEffectOpener;
}) {
  const hideLayerName = props.expandedActionsVisible && !props.editableName.editingName;

  return (
    <div className="relative min-w-0 w-full overflow-hidden">
      <LayerTrigger
        dragHandlers={props.dragHandlers}
        editableName={props.editableName}
        hidden={hideLayerName}
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
        isImmutable={props.isImmutable || props.layer.locked}
        layer={props.layer}
      />
      <LayerExpandedActions
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
        editingName={props.editableName.editingName}
        isImmutable={props.isImmutable}
        layer={props.layer}
        visible={props.expandedActionsVisible}
        onRenameLayer={props.editableName.startEditing}
        onOpenLayerEffects={props.onOpenLayerEffects}
      />
    </div>
  );
}

function createLayerDragHandlers(props: {
  isImmutable: boolean;
  layerId: string;
  onDrop: (targetLayerId: string) => void;
  setDraggedLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverLayerId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  return {
    onDragEnd: () => {
      props.setDraggedLayerId(null);
      props.setDragOverLayerId(null);
    },
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      if (!props.isImmutable) {
        event.preventDefault();
        props.setDragOverLayerId(props.layerId);
      }
    },
    onDragStart: () => {
      if (!props.isImmutable) {
        props.setDraggedLayerId(props.layerId);
      }
    },
    onDrop: (event: React.DragEvent<HTMLDivElement>) => {
      if (!props.isImmutable) {
        event.preventDefault();
        props.onDrop(props.layerId);
      }
    },
  };
}

export function LayerRow(props: {
  layer: EditorLayerItem;
  dragOverLayerId: string | null;
  autoNavigateSelectedLayer?: boolean;
  setDraggedLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  onDrop: (targetLayerId: string) => void;
  onOpenLayerEffects: LayerEffectOpener;
}) {
  const isImmutable = Boolean(props.layer.immutable);
  const isDragDisabled = isImmutable || props.layer.locked;
  const editableName = useEditableLayerName(props.layer);
  const expandedActionsVisibility = useExpandedActionsVisibility();
  const dragHandlers = createLayerDragHandlers({
    isImmutable: isDragDisabled,
    layerId: props.layer.id,
    onDrop: props.onDrop,
    setDraggedLayerId: props.setDraggedLayerId,
    setDragOverLayerId: props.setDragOverLayerId,
  });

  return (
    <div
      key={props.layer.id}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      onMouseEnter={expandedActionsVisibility.showExpandedActions}
      onMouseLeave={expandedActionsVisibility.hideExpandedActions}
      className={getLayerRowClassName(props.layer, props.dragOverLayerId, isImmutable)}
    >
      <LayerSelectionToggle
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer === true}
        layer={props.layer}
      />
      <LayerInlineActionsSlot
        dragHandlers={dragHandlers}
        editableName={editableName}
        expandedActionsVisible={expandedActionsVisibility.expandedActionsVisible}
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer === true}
        isImmutable={isImmutable}
        layer={props.layer}
        onOpenLayerEffects={props.onOpenLayerEffects}
      />
      <LayerActionRail layer={props.layer} />
    </div>
  );
}
