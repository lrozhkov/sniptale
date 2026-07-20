import type { ScenarioSlideRenderAssetMap } from '../project/stage-render/slide';
import type { ScenarioCanvasViewportController } from '../canvas/viewport-state';
import { ScenarioSlideRail } from './slide-rail';
import { ScenarioEditorInspectorPanelBridge } from './scenario-inspector-panel-bridge';
import type { useScenarioV3EditorState } from './state';
import type { useScenarioV3TemplateState } from './template-state';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;
type ScenarioV3TemplateState = ReturnType<typeof useScenarioV3TemplateState>;

export function ScenarioV3LeftInspector(props: {
  canvasControls: ScenarioCanvasViewportController['controls'];
  editor: ScenarioV3EditorState;
  inspectorTool: 'export' | 'grid' | null;
  onClearInspectorTool: () => void;
  onEditImageElement: (elementId: string) => void;
  onOpenExport: () => void;
}) {
  return (
    <ScenarioEditorInspectorPanelBridge
      canvasControls={props.canvasControls}
      editor={props.editor}
      inspectorTool={props.inspectorTool}
      onClearInspectorTool={props.onClearInspectorTool}
      onEditImageElement={props.onEditImageElement}
      onOpenExport={props.onOpenExport}
    />
  );
}

export function ScenarioV3RightRail(props: {
  assets: ScenarioSlideRenderAssetMap;
  editor: ScenarioV3EditorState;
  onClearInspectorTool: () => void;
  onCreateTemplateSlide: ScenarioV3TemplateState['createSlide'];
  onOpenTemplateManager: ScenarioV3TemplateState['openManager'];
  onToggleTemplatePicker: () => void;
  templatePickerOpen: boolean;
  templates: ScenarioV3TemplateState['templates'];
}) {
  return (
    <ScenarioSlideRail
      assets={props.assets}
      onAddSlide={props.editor.slideActions.addSlide}
      onCreateTemplateSlide={props.onCreateTemplateSlide}
      onDeleteSlide={props.editor.slideActions.deleteSlide}
      onDuplicateSlide={props.editor.slideActions.duplicateSlide}
      onMoveSlide={props.editor.slideActions.moveSlide}
      onOpenTemplateManager={props.onOpenTemplateManager}
      onSelectSlide={(slideId) => {
        props.onClearInspectorTool();
        props.editor.slideActions.selectSlide(slideId);
      }}
      onToggleTemplatePicker={props.onToggleTemplatePicker}
      selectedSlideId={props.editor.selectedSlide.id}
      slides={props.editor.project.slides}
      templatePickerOpen={props.templatePickerOpen}
      templates={props.templates}
    />
  );
}
