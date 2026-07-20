import type { ScenarioSlideRenderAssetMap } from '../project/stage-render/slide';
import type { ScenarioV3ElementKind } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioCanvasStage } from '../canvas';
import type { ScenarioCanvasViewportController } from '../canvas/viewport-state';
import type { ScenarioDrawingDocument } from '../drawing';
import type { useScenarioV3EditorState } from './state';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;

export function ScenarioV3EditSurface(props: {
  activeInsertKind?: ScenarioV3ElementKind | null;
  assetState: { assets: ScenarioSlideRenderAssetMap; loading: boolean };
  canvasViewport: ScenarioCanvasViewportController;
  clickIndex: number;
  drawingDocument?: ScenarioDrawingDocument;
  editor: ScenarioV3EditorState;
  onActiveInsertKindChange?: (kind: ScenarioV3ElementKind | null) => void;
  onClearInspectorTool: () => void;
  onEditImageElement: (elementId: string) => void;
}) {
  return (
    <div className="relative h-full min-h-0" data-ui="scenario.editor.edit-surface">
      <ScenarioCanvasStage
        activeInsertKind={props.activeInsertKind ?? null}
        assets={props.assetState.assets}
        assetsLoading={props.assetState.loading}
        clickIndex={props.clickIndex}
        {...(props.drawingDocument ? { drawingDocument: props.drawingDocument } : {})}
        onDeleteElement={props.editor.elementActions.deleteElement}
        onClearActiveInsertKind={() => props.onActiveInsertKindChange?.(null)}
        onEditImageElement={props.onEditImageElement}
        onInsertElementAtPoint={(kind, point) => {
          props.editor.elementActions.insertElementAtPoint(kind, point);
          props.onActiveInsertKindChange?.(null);
        }}
        onInsertElementFromDrag={(kind, origin, current) => {
          props.editor.elementActions.insertElementFromDrag(kind, origin, current);
          props.onActiveInsertKindChange?.(null);
        }}
        onSelectElement={(elementId) => {
          props.onActiveInsertKindChange?.(null);
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
