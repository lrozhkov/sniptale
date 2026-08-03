import type { ScenarioSlideRenderAssetMap } from '../project/stage-render/slide';
import { ScenarioCanvasStage } from '../canvas';
import type { ScenarioCanvasViewportController } from '../canvas/viewport-state';
import type { ScenarioDrawingDocument } from '../drawing';
import type { useScenarioV3EditorState } from './state';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;

export function ScenarioV3EditSurface(props: {
  assetState: { assets: ScenarioSlideRenderAssetMap; loading: boolean };
  canvasViewport: ScenarioCanvasViewportController;
  clickIndex: number;
  drawingDocument?: ScenarioDrawingDocument;
  editor: ScenarioV3EditorState;
  onClearInspectorTool: () => void;
  onEditImageElement: (elementId: string) => void;
}) {
  return (
    <div className="relative h-full min-h-0" data-ui="scenario.editor.edit-surface">
      <ScenarioCanvasStage
        assets={props.assetState.assets}
        assetsLoading={props.assetState.loading}
        clickIndex={props.clickIndex}
        {...(props.drawingDocument ? { drawingDocument: props.drawingDocument } : {})}
        onDeleteElement={props.editor.elementActions.deleteElement}
        onEditImageElement={props.onEditImageElement}
        onSelectElement={(elementId) => {
          props.onClearInspectorTool();
          props.editor.elementActions.selectElement(elementId);
        }}
        onSelectSlide={() => {
          props.onClearInspectorTool();
          props.editor.elementActions.selectSlideSurface();
        }}
        onUpdateElement={props.editor.elementActions.updateElement}
        selectedElementId={props.editor.selectedElementId}
        slide={props.editor.selectedSlide}
        viewportController={props.canvasViewport}
      />
    </div>
  );
}
