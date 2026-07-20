import { useAppLocale } from '../../../platform/i18n';
import { LayerPanelBody } from './body';
import { LayerPanelFrame } from './frame';
import type { EditorInspectorLayersPanelProps } from './types';
import { useLayerPanelView } from './view';

export function EditorInspectorLayersPanel(props: EditorInspectorLayersPanelProps) {
  useAppLocale();
  const panelView = useLayerPanelView(props);

  return (
    <LayerPanelFrame
      expandedHeight={panelView.layout.expandedHeight}
      autoNavigateSelectedLayer={panelView.state.autoNavigateSelectedLayer}
      expanded={panelView.state.expanded}
      fillContainer={Boolean(props.fillContainer)}
      frameRef={panelView.refs.frameRef}
      headerRef={panelView.refs.headerRef}
      layerCount={props.layers.length}
      {...(props.onCollapsePanel === undefined ? {} : { onCollapsePanel: props.onCollapsePanel })}
      onToggle={panelView.actions.toggleExpanded}
      onToggleAutoNavigateSelectedLayer={panelView.actions.toggleAutoNavigateSelectedLayer}
    >
      <LayerPanelBody
        actionsRef={panelView.refs.actionsRef}
        bodyRef={panelView.refs.bodyRef}
        expanded={panelView.state.expanded}
        listRef={panelView.refs.listRef}
        selectedObjectCount={props.selectedObjectCount}
        layers={props.layers}
        dragOverLayerId={panelView.state.dragOverLayerId}
        autoNavigateSelectedLayer={panelView.state.autoNavigateSelectedLayer}
        reserveScrollbarGutter={panelView.layout.reserveScrollbarGutter}
        scrollable={panelView.layout.scrollable}
        setDraggedLayerId={panelView.state.setDraggedLayerId}
        setDragOverLayerId={panelView.state.setDragOverLayerId}
        onDrop={panelView.actions.handleLayerDrop}
        onOpenLayerEffects={props.onOpenLayerEffects}
      />
    </LayerPanelFrame>
  );
}
