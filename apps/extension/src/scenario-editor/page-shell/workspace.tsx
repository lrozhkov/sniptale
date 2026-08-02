import type { ScenarioSlideRenderAssetMap } from '../project/stage-render/slide';
import type { ScenarioCanvasViewportController } from '../canvas/viewport-state';
import { useScenarioDrawingDocument, type ScenarioDrawingDocument } from '../drawing';
import { useScenarioV3RenderAssetState } from './assets';
import { ScenarioV3EditSurface } from './workspace-edit-surface';
import {
  advanceScenarioPresentation,
  getScenarioPresentationSlideIndex,
  rewindScenarioPresentation,
} from './presentation/actions';
import { SCENARIO_EDITOR_MODES, type ScenarioEditorMode } from './presentation/mode';
import { ScenarioDeckPlaySurface } from './presentation/play-surface';
import { ScenarioV3FloatingChrome } from './floating-chrome';
import type { useScenarioV3EditorState } from './state';
import type { ScenarioV3EditorSaveStatus } from './types';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;
type ScenarioV3WorkspaceAssetState = ReturnType<typeof useScenarioV3RenderAssetState>;

type ScenarioV3WorkspaceProps = {
  canvasViewport: ScenarioCanvasViewportController;
  aiPanelOpen?: boolean;
  clickIndex: number;
  editor: ScenarioV3EditorState;
  inspectorTool: 'export' | null;
  mode: ScenarioEditorMode;
  saveStatus?: ScenarioV3EditorSaveStatus | undefined;
  onClickIndexChange: (clickIndex: number) => void;
  onClearInspectorTool: () => void;
  onEditImageElement: (elementId: string) => void;
  onModeChange: (mode: ScenarioEditorMode) => void;
  onOpenExport: () => void;
  onToggleAi: () => void;
};

export function ScenarioV3Workspace(props: ScenarioV3WorkspaceProps) {
  const assetState = useScenarioV3RenderAssetState(props.editor.project);
  const drawingDocument = useScenarioDrawingDocument(props.editor.selectedSlide.id);
  const rightPanelHidden = props.aiPanelOpen === true;

  if (props.mode !== SCENARIO_EDITOR_MODES.edit) {
    return (
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <ScenarioV3CenterSurface {...props} assetState={assetState} />
        {renderScenarioFloatingChrome({
          assetState,
          props,
          rightPanelHidden,
        })}
      </main>
    );
  }

  return (
    <main className="relative min-h-0 flex-1 overflow-hidden">
      <div className="absolute inset-0 min-h-0 min-w-0" data-ui="scenario.canvas.layer">
        <ScenarioV3CenterSurface
          {...props}
          assetState={assetState}
          drawingDocument={drawingDocument}
        />
      </div>
      {renderScenarioFloatingChrome({
        assetState,
        props,
        rightPanelHidden,
      })}
    </main>
  );
}

function renderScenarioFloatingChrome(args: {
  assetState: ScenarioV3WorkspaceAssetState;
  props: ScenarioV3WorkspaceProps;
  rightPanelHidden: boolean;
}) {
  const { props } = args;
  return (
    <ScenarioV3FloatingChrome
      assets={args.assetState.assets}
      canvasControls={props.canvasViewport.controls}
      editor={props.editor}
      inspectorTool={props.inspectorTool}
      mode={props.mode}
      rightPanelHidden={args.rightPanelHidden}
      saveStatus={props.saveStatus}
      onClearInspectorTool={props.onClearInspectorTool}
      onEditImageElement={props.onEditImageElement}
      onModeChange={props.onModeChange}
      onOpenExport={props.onOpenExport}
      onToggleAi={props.onToggleAi}
    />
  );
}

function ScenarioV3CenterSurface(props: {
  assetState: { assets: ScenarioSlideRenderAssetMap; loading: boolean };
  canvasViewport: ScenarioCanvasViewportController;
  clickIndex: number;
  drawingDocument?: ScenarioDrawingDocument;
  editor: ScenarioV3EditorState;
  mode: ScenarioEditorMode;
  onClickIndexChange: (clickIndex: number) => void;
  onClearInspectorTool: () => void;
  onEditImageElement: (elementId: string) => void;
  onModeChange: (mode: ScenarioEditorMode) => void;
}) {
  if (props.mode === SCENARIO_EDITOR_MODES.play) {
    return <PlaySurface {...props} assets={props.assetState.assets} />;
  }
  return (
    <ScenarioV3EditSurface
      {...props}
      {...(props.drawingDocument ? { drawingDocument: props.drawingDocument } : {})}
    />
  );
}

function PlaySurface(props: {
  assets: ScenarioSlideRenderAssetMap;
  clickIndex: number;
  editor: ScenarioV3EditorState;
  onClickIndexChange: (clickIndex: number) => void;
  onModeChange: (mode: ScenarioEditorMode) => void;
}) {
  const slideIndex = getScenarioPresentationSlideIndex(
    props.editor.project,
    props.editor.selectedSlide.id
  );
  return (
    <ScenarioDeckPlaySurface
      assets={props.assets}
      clickIndex={props.clickIndex}
      onNext={() => advanceScenarioPresentation(createPresentationActionController(props))}
      onPrevious={() => rewindScenarioPresentation(createPresentationActionController(props))}
      onExit={() => props.onModeChange(SCENARIO_EDITOR_MODES.edit)}
      slide={props.editor.selectedSlide}
      slideIndex={slideIndex}
      slideTotal={props.editor.project.slides.length}
    />
  );
}

function createPresentationActionController(props: {
  clickIndex: number;
  editor: ScenarioV3EditorState;
  onClickIndexChange: (clickIndex: number) => void;
}) {
  return {
    clickIndex: props.clickIndex,
    onClickIndexChange: props.onClickIndexChange,
    project: props.editor.project,
    selectedSlideId: props.editor.selectedSlide.id,
    selectSlide: props.editor.slideActions.selectSlide,
  };
}
