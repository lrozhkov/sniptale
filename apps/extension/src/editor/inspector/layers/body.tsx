import type React from 'react';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { EditorInspectorLayersList } from './header';
import { LayerSelectionActions } from './selection-actions';
import type { EditorInspectorLayersPanelProps } from './types';

const PANEL_BODY_CLASS_NAME =
  'flex min-h-0 flex-1 flex-col border-t border-[color:var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)]';

type LayerPanelBodyProps = {
  actionsRef: React.RefObject<HTMLDivElement | null>;
  autoNavigateSelectedLayer: boolean;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  dragOverLayerId: string | null;
  expanded: boolean;
  layers: EditorLayerItem[];
  listRef: React.RefObject<HTMLDivElement | null>;
  onDrop: (targetLayerId: string) => void;
  onOpenLayerEffects: EditorInspectorLayersPanelProps['onOpenLayerEffects'];
  reserveScrollbarGutter: boolean;
  scrollable: boolean;
  selectedObjectCount: number;
  setDraggedLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverLayerId: React.Dispatch<React.SetStateAction<string | null>>;
};

export function LayerPanelBody(props: LayerPanelBodyProps) {
  if (!props.expanded) {
    return null;
  }

  return (
    <div ref={props.bodyRef} data-ui="editor.layers.panel-body" className={PANEL_BODY_CLASS_NAME}>
      <div ref={props.actionsRef} data-ui="editor.layers.selection-actions">
        <LayerSelectionActions
          layers={props.layers}
          selectedObjectCount={props.selectedObjectCount}
        />
      </div>
      <EditorInspectorLayersList
        listRef={props.listRef}
        layers={props.layers}
        dragOverLayerId={props.dragOverLayerId}
        autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
        reserveScrollbarGutter={props.reserveScrollbarGutter}
        scrollable={props.scrollable}
        setDraggedLayerId={props.setDraggedLayerId}
        setDragOverLayerId={props.setDragOverLayerId}
        onDrop={props.onDrop}
        onOpenLayerEffects={props.onOpenLayerEffects}
      />
    </div>
  );
}
