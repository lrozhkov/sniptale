import React from 'react';
import { ChevronDown, ChevronUp, Layers3, Minus, SquareMousePointer } from 'lucide-react';
import { translate, useAppLocale } from '../../../platform/i18n';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { cx } from '../../chrome/ui';
import { LayerRow } from './row';
import { ACTIVE_LAYER_NAVIGATION_BORDER_CLASS_NAME } from './header.constants';
import {
  EMPTY_STATE_CLASS_NAME,
  PANEL_ICON_CLASS_NAME,
  PANEL_ICON_SURFACE_CLASS_NAME,
} from './shared';
import { LayerInsertImageControl } from './file-input';
import type { EditorLayerEffectsOpenHandler } from './types';

const HEADER_FRAME_CLASS_NAME =
  'flex h-14 w-full items-center justify-between px-2 pr-3 transition';

const HEADER_TOGGLE_BUTTON_CLASS_NAME =
  'inline-flex h-8 w-8 items-center justify-center rounded-[10px] ' +
  'text-[color:var(--sniptale-color-text-muted)] transition ' +
  'hover:bg-[color:var(--sniptale-color-surface-hover)] focus:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-[color:var(--sniptale-color-focus-ring)]';
const HEADER_NAVIGATION_BUTTON_CLASS_NAME =
  HEADER_TOGGLE_BUTTON_CLASS_NAME +
  ' data-[active=true]:border' +
  ` ${ACTIVE_LAYER_NAVIGATION_BORDER_CLASS_NAME}` +
  ' data-[active=true]:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_8%,transparent)]' +
  ' data-[active=true]:text-[color:var(--sniptale-color-accent-emphasis)]';
const LIST_VIEWPORT_BASE_CLASS_NAME = 'min-h-0 flex-1 space-y-2 px-2 pb-6 pt-3';

type EditorInspectorLayersListProps = {
  layers: EditorLayerItem[];
  dragOverLayerId: string | null;
  setDraggedLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  onDrop: (targetLayerId: string) => void;
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
    args.reserveScrollbarGutter && '[scrollbar-gutter:stable_both-edges]'
  );
}

function EditorInspectorLayersHeaderTitle(props: { layerCount: number }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-2 text-left">
      <span className={cx(PANEL_ICON_CLASS_NAME, PANEL_ICON_SURFACE_CLASS_NAME)}>
        <Layers3 size={17} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[color:var(--sniptale-color-text-primary)]">
          {translate('editor.toolbar.layersTitle')}
        </span>
        <span className="block text-[12px] font-semibold uppercase text-[color:var(--sniptale-color-text-secondary)]">
          {props.layerCount} {translate('editor.toolbar.layerCountSuffix')}
        </span>
      </span>
    </div>
  );
}

function EditorInspectorLayersHeaderActions(props: {
  autoNavigateSelectedLayer: boolean;
  expanded: boolean;
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
      <button
        type="button"
        title={translate('editor.toolbar.layerAutoNavigate')}
        aria-label={translate('editor.toolbar.layerAutoNavigate')}
        aria-pressed={props.autoNavigateSelectedLayer}
        data-active={props.autoNavigateSelectedLayer ? 'true' : undefined}
        data-ui="editor.layers.auto-navigate"
        onClick={props.onToggleAutoNavigateSelectedLayer}
        className={HEADER_NAVIGATION_BUTTON_CLASS_NAME}
      >
        <SquareMousePointer size={16} className="text-current" />
      </button>
      <LayerInsertImageControl />
      <button
        type="button"
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
      </button>
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
}: {
  autoNavigateSelectedLayer?: boolean;
  expanded: boolean;
  layerCount: number;
  onCollapsePanel?: () => void;
  onToggle: () => void;
  onToggleAutoNavigateSelectedLayer?: () => void;
}) {
  return (
    <div className={HEADER_FRAME_CLASS_NAME}>
      <EditorInspectorLayersHeaderTitle layerCount={layerCount} />
      <EditorInspectorLayersHeaderActions
        autoNavigateSelectedLayer={autoNavigateSelectedLayer}
        expanded={expanded}
        {...(onCollapsePanel === undefined ? {} : { onCollapsePanel })}
        onToggle={onToggle}
        onToggleAutoNavigateSelectedLayer={onToggleAutoNavigateSelectedLayer}
      />
    </div>
  );
}

export function EditorInspectorLayersList({
  layers,
  dragOverLayerId,
  setDraggedLayerId,
  setDragOverLayerId,
  onDrop,
  autoNavigateSelectedLayer = false,
  onOpenLayerEffects,
  listRef,
  reserveScrollbarGutter = false,
  scrollable = false,
}: EditorInspectorLayersListProps) {
  useAppLocale();
  return (
    <div
      ref={listRef}
      data-ui="editor.layers.list-viewport"
      className={getListViewportClassName({ reserveScrollbarGutter, scrollable })}
    >
      {layers.length > 0 ? (
        layers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            dragOverLayerId={dragOverLayerId}
            setDraggedLayerId={setDraggedLayerId}
            setDragOverLayerId={setDragOverLayerId}
            onDrop={onDrop}
            autoNavigateSelectedLayer={autoNavigateSelectedLayer}
            onOpenLayerEffects={onOpenLayerEffects}
          />
        ))
      ) : (
        <div className={EMPTY_STATE_CLASS_NAME}>{translate('editor.toolbar.noLayers')}</div>
      )}
    </div>
  );
}
