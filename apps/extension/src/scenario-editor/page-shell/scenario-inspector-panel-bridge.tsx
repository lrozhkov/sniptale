import type { ComponentProps } from 'react';
import type { ScenarioCanvasViewportController } from '../canvas/viewport-state';
import { ScenarioInspectorPanel } from '../inspector';

type ScenarioInspectorPanelProps = ComponentProps<typeof ScenarioInspectorPanel>;

type ScenarioInspectorEditor = {
  elementActions: {
    deleteElement: NonNullable<ScenarioInspectorPanelProps['onDeleteElement']>;
    insertImageFile: NonNullable<ScenarioInspectorPanelProps['onInsertImageFile']>;
    moveElement: NonNullable<ScenarioInspectorPanelProps['onMoveElement']>;
    selectElement: (elementId: string) => void;
    updateElement: NonNullable<ScenarioInspectorPanelProps['onUpdateElement']>;
  };
  elements: ScenarioInspectorPanelProps['elements'];
  project: NonNullable<ScenarioInspectorPanelProps['project']>;
  projectActions: {
    updatePresentation: NonNullable<ScenarioInspectorPanelProps['onUpdatePresentation']>;
  };
  selectedElementId: ScenarioInspectorPanelProps['selectedElementId'];
  selectedSlide: NonNullable<ScenarioInspectorPanelProps['slide']>;
  slideActions: {
    updateSlide: NonNullable<ScenarioInspectorPanelProps['onUpdateSlide']>;
  };
};

export function ScenarioEditorInspectorPanelBridge(props: {
  canvasControls: ScenarioCanvasViewportController['controls'];
  editor: ScenarioInspectorEditor;
  inspectorTool: 'export' | 'grid' | null;
  embedded?: boolean;
  hideLayers?: boolean;
  onClearInspectorTool: () => void;
  onEditImageElement: (elementId: string) => void;
  onOpenExport: () => void;
}) {
  return (
    <ScenarioInspectorPanel
      elements={props.editor.elements}
      onDeleteElement={props.editor.elementActions.deleteElement}
      onEditImageElement={props.onEditImageElement}
      onInsertImageFile={props.editor.elementActions.insertImageFile}
      onMoveElement={props.editor.elementActions.moveElement}
      onSelectElement={(elementId) => {
        props.onClearInspectorTool();
        props.editor.elementActions.selectElement(elementId);
      }}
      onUpdateElement={props.editor.elementActions.updateElement}
      onUpdatePresentation={props.editor.projectActions.updatePresentation}
      onUpdateSlide={props.editor.slideActions.updateSlide}
      activeTool={props.inspectorTool}
      canvasControls={props.canvasControls}
      exportCommand={{ onOpenExport: props.onOpenExport }}
      presentation={props.editor.project.presentation}
      project={props.editor.project}
      selectedElementId={props.editor.selectedElementId}
      slide={props.editor.selectedSlide}
      {...(props.embedded === undefined ? {} : { embedded: props.embedded })}
      {...(props.hideLayers === undefined ? {} : { hideLayers: props.hideLayers })}
    />
  );
}
