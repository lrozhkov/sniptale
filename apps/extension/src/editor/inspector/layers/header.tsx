import React from 'react';
import { ChevronDown, ChevronUp, Layers3, Minus, SquareMousePointer } from 'lucide-react';
import { translate, useAppLocale } from '../../../platform/i18n';
import type { EditorLayerChild, EditorLayerItem } from '../../../features/editor/document/types';
import { getLayerIcon } from '../../chrome/tool-icons';
import { EditorIconButton, cx } from '../../chrome/ui';
import { LayerRow } from './row';
import { useLayerPointerReorder } from './pointer-reorder';
import { useEditorController } from '../../application/controller-context';
import { LayerInsertImageControl } from './file-input';
import { ACTIVE_LAYER_NAVIGATION_ICON_CLASS_NAME } from './header.constants';
import {
  EMPTY_STATE_CLASS_NAME,
  PANEL_ICON_CLASS_NAME,
  PANEL_ICON_SURFACE_CLASS_NAME,
} from './shared';
import type { EditorLayerEffectsOpenHandler } from './types';

const HEADER_FRAME_CLASS_NAME = 'flex h-14 w-full items-center justify-between px-3 transition';

const HEADER_TOGGLE_BUTTON_CLASS_NAME =
  'inline-flex h-8 w-8 items-center justify-center rounded-[4px] ' +
  'text-[color:var(--sniptale-color-text-muted)] transition ' +
  'hover:bg-[color:var(--sniptale-color-surface-hover)] focus:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-[color:var(--sniptale-color-focus-ring)]';
const LIST_VIEWPORT_BASE_CLASS_NAME =
  'min-h-0 flex-1 space-y-1 overflow-x-hidden py-3 [scrollbar-width:thin]';
const GROUP_CHILD_BUTTON_CLASS_NAME =
  'flex min-h-8 w-full items-center gap-1 rounded-[4px] px-1 text-left text-[13px] leading-[18px]';
const GROUP_CHILD_FOCUS_CLASS_NAME =
  'focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-[color:var(--sniptale-color-focus-ring)]';
const GROUP_CHILD_SELECTED_CLASS_NAME =
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-canvas-selection)_12%,transparent)] ' +
  'text-[color:var(--sniptale-color-canvas-selection)]';
const GROUP_CHILD_IDLE_CLASS_NAME =
  'text-[color:var(--sniptale-color-text-secondary)] ' +
  'hover:bg-[color:var(--sniptale-color-surface-hover)]';

type EditorInspectorLayersListProps = {
  layers: EditorLayerItem[];
  setDraggedLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  autoNavigateSelectedLayer?: boolean;
  onOpenLayerEffects: EditorLayerEffectsOpenHandler;
  listRef?: React.Ref<HTMLDivElement>;
  reserveScrollbarGutter?: boolean;
  scrollable?: boolean;
};

function getListViewportClassName(args: { reserveScrollbarGutter: boolean; scrollable: boolean }) {
  return cx(
    LIST_VIEWPORT_BASE_CLASS_NAME,
    args.scrollable ? 'overflow-y-auto' : 'overflow-y-hidden',
    args.reserveScrollbarGutter ? 'px-3 [scrollbar-gutter:stable]' : 'px-3'
  );
}

function EditorInspectorLayersHeaderTitle(props: { layerCount: number; streamlined: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
      {props.streamlined ? null : (
        <span className={cx(PANEL_ICON_CLASS_NAME, PANEL_ICON_SURFACE_CLASS_NAME)}>
          <Layers3 size={17} strokeWidth={2} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold leading-5 text-[color:var(--sniptale-color-text-primary)]">
          {translate('editor.toolbar.layersTitle')}
        </span>
        <span className="block text-[12px] font-normal leading-4 text-[color:var(--sniptale-color-text-secondary)]">
          {props.layerCount} {translate('editor.toolbar.layerCountSuffix')}
        </span>
      </span>
    </div>
  );
}

function EditorInspectorLayersHeaderActions(props: {
  autoNavigateSelectedLayer: boolean;
  expanded: boolean;
  streamlined: boolean;
  onCollapsePanel?: () => void;
  onToggle: () => void;
  onToggleAutoNavigateSelectedLayer: () => void;
}) {
  const handleClick = props.onCollapsePanel ?? props.onToggle;

  return (
    <div
      className="flex shrink-0 items-center gap-1"
      data-ui="editor.layers.action-rail"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <LayerInsertImageControl withLabel />
      <EditorIconButton
        variant="utility"
        title={translate('editor.toolbar.layerAutoNavigate')}
        aria-label={translate('editor.toolbar.layerAutoNavigate')}
        aria-pressed={props.autoNavigateSelectedLayer}
        active={props.autoNavigateSelectedLayer}
        data-ui="editor.layers.auto-navigate"
        onClick={props.onToggleAutoNavigateSelectedLayer}
        className={HEADER_TOGGLE_BUTTON_CLASS_NAME}
      >
        <SquareMousePointer
          size={16}
          className={
            props.autoNavigateSelectedLayer
              ? ACTIVE_LAYER_NAVIGATION_ICON_CLASS_NAME
              : 'text-current'
          }
        />
      </EditorIconButton>
      {props.streamlined ? null : (
        <>
          <EditorIconButton
            variant="utility"
            title={translate('editor.toolbar.layersTitle')}
            aria-label={translate('editor.toolbar.layersTitle')}
            onClick={handleClick}
            className={HEADER_TOGGLE_BUTTON_CLASS_NAME}
          >
            {props.onCollapsePanel ? (
              <Minus size={16} className="text-[color:var(--sniptale-color-text-muted)]" />
            ) : props.expanded ? (
              <ChevronDown size={16} className="text-[color:var(--sniptale-color-text-muted)]" />
            ) : (
              <ChevronUp size={16} className="text-[color:var(--sniptale-color-text-muted)]" />
            )}
          </EditorIconButton>
        </>
      )}
    </div>
  );
}

export function EditorInspectorLayersHeader({
  autoNavigateSelectedLayer = false,
  expanded,
  layerCount,
  onCollapsePanel,
  onToggle,
  onToggleAutoNavigateSelectedLayer = () => undefined,
  streamlined = false,
}: {
  autoNavigateSelectedLayer?: boolean;
  expanded: boolean;
  layerCount: number;
  onCollapsePanel?: () => void;
  onToggle: () => void;
  onToggleAutoNavigateSelectedLayer?: () => void;
  streamlined?: boolean;
}) {
  return (
    <div className={HEADER_FRAME_CLASS_NAME}>
      <EditorInspectorLayersHeaderTitle layerCount={layerCount} streamlined={streamlined} />
      <EditorInspectorLayersHeaderActions
        autoNavigateSelectedLayer={autoNavigateSelectedLayer}
        expanded={expanded}
        streamlined={streamlined}
        {...(onCollapsePanel === undefined ? {} : { onCollapsePanel })}
        onToggle={onToggle}
        onToggleAutoNavigateSelectedLayer={onToggleAutoNavigateSelectedLayer}
      />
    </div>
  );
}

function GroupChildRows(props: { layers: EditorLayerChild[]; autoNavigateSelectedLayer: boolean }) {
  const controller = useEditorController();
  return (
    <div
      data-ui="editor.layers.group-children"
      className="ml-4 border-l border-[color:var(--sniptale-color-border-soft)] pl-2"
    >
      {props.layers.map((child) => (
        <div key={child.id}>
          <button
            type="button"
            title={child.name}
            aria-pressed={child.selected === true}
            data-ui="editor.layers.group-child"
            data-layer-id={child.id}
            data-editor-layer-id={child.id}
            data-parent-context={child.containsSelection || undefined}
            className={cx(
              GROUP_CHILD_BUTTON_CLASS_NAME,
              GROUP_CHILD_FOCUS_CLASS_NAME,
              child.selected ? GROUP_CHILD_SELECTED_CLASS_NAME : GROUP_CHILD_IDLE_CLASS_NAME
            )}
            onClick={(event) =>
              controller.selectLayer(child.id, {
                additive: event.ctrlKey || event.metaKey,
                toggle: event.ctrlKey || event.metaKey,
                range: event.shiftKey,
                focusViewport: props.autoNavigateSelectedLayer,
              })
            }
          >
            <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
              {getLayerIcon(child.type)}
            </span>
            <span className="truncate">{child.name}</span>
          </button>
          {(child.selected || child.containsSelection) && child.groupChildren?.length ? (
            <GroupChildRows
              layers={child.groupChildren}
              autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export const EditorInspectorLayersList = React.memo(function EditorInspectorLayersList({
  layers,
  setDraggedLayerId,
  setDragOverLayerId,
  autoNavigateSelectedLayer = false,
  onOpenLayerEffects,
  listRef,
  reserveScrollbarGutter = false,
  scrollable = false,
}: EditorInspectorLayersListProps) {
  const locale = useAppLocale();
  const controller = useEditorController();
  const onMove = React.useCallback(
    (ids: readonly string[], beforeId: string | null) =>
      controller.reorderLayerBlock(ids, beforeId),
    [controller]
  );
  const reorder = useLayerPointerReorder({ layers, onMove, setDraggedLayerId, setDragOverLayerId });
  const dragBlocked = layers.some(
    (layer) => layer.selected && !layer.reorderable && (layer.immutable || layer.locked)
  );
  return (
    <div
      ref={listRef}
      data-ui="editor.layers.list-viewport"
      className={getListViewportClassName({ reserveScrollbarGutter, scrollable })}
    >
      {layers.length > 0 ? (
        reorder.layers.map((layer) => (
          <div key={layer.id} data-layer-reorder-row={layer.id}>
            <LayerRow
              layer={layer}
              locale={locale}
              draggedLayerId={
                reorder.draggingIds.includes(layer.id) ? layer.id : reorder.draggingId
              }
              dragBlocked={dragBlocked}
              onPointerStart={reorder.start}
              autoNavigateSelectedLayer={autoNavigateSelectedLayer}
              onOpenLayerEffects={onOpenLayerEffects}
            />
            {(layer.selected || layer.containsSelection) && layer.groupChildren?.length ? (
              <GroupChildRows
                layers={layer.groupChildren}
                autoNavigateSelectedLayer={autoNavigateSelectedLayer}
              />
            ) : null}
          </div>
        ))
      ) : (
        <div className={EMPTY_STATE_CLASS_NAME}>{translate('editor.toolbar.noLayers')}</div>
      )}
    </div>
  );
});
