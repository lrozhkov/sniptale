import type { ComponentProps } from 'react';
import { ScenarioInspectorPanel } from '../inspector';

type ScenarioInspectorPanelProps = ComponentProps<typeof ScenarioInspectorPanel>;

type ScenarioInspectorEditor = {
  elementActions: {
    deleteElement: NonNullable<ScenarioInspectorPanelProps['onDeleteElement']>;
    updateElement: NonNullable<ScenarioInspectorPanelProps['onUpdateElement']>;
  };
  elements: ScenarioInspectorPanelProps['elements'];
  selectedElementId: ScenarioInspectorPanelProps['selectedElementId'];
  selectedSlide: NonNullable<ScenarioInspectorPanelProps['slide']>;
  slideActions: {
    updateSlide: NonNullable<ScenarioInspectorPanelProps['onUpdateSlide']>;
  };
};

export function ScenarioEditorInspectorPanelBridge(props: {
  editor: ScenarioInspectorEditor;
  inspectorTool: 'export' | null;
  onEditImageElement: (elementId: string) => void;
  onOpenExport: () => void;
}) {
  return (
    <ScenarioInspectorPanel
      elements={props.editor.elements}
      onDeleteElement={props.editor.elementActions.deleteElement}
      onEditImageElement={props.onEditImageElement}
      onUpdateElement={props.editor.elementActions.updateElement}
      onUpdateSlide={props.editor.slideActions.updateSlide}
      activeTool={props.inspectorTool}
      exportCommand={{ onOpenExport: props.onOpenExport }}
      selectedElementId={props.editor.selectedElementId}
      slide={props.editor.selectedSlide}
      embedded
    />
  );
}
