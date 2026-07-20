import { useState } from 'react';
import type { ScenarioSlideRenderAssetMap } from '../project/stage-render/slide';
import type { ScenarioV3ElementKind } from '@sniptale/runtime-contracts/scenario/types/v3';
import { useActiveCanvasInsertEscape } from '@sniptale/ui/canvas-tools';
import type { ScenarioCanvasViewportController } from '../canvas/viewport-state';
import { useScenarioDrawingDocument, type ScenarioDrawingDocument } from '../drawing';
import { useScenarioV3RenderAssetState } from './assets';
import { ScenarioV3EditSurface } from './workspace-edit-surface';
import {
  advanceScenarioPresentation,
  getScenarioPresentationSlideIndex,
  rewindScenarioPresentation,
} from './presentation/actions';
import { type ScenarioPresentationPosition } from './presentation/navigation';
import { SCENARIO_EDITOR_MODES, type ScenarioEditorMode } from './presentation/mode';
import { ScenarioOverviewSurface } from './presentation/overview';
import { ScenarioDeckPlaySurface } from './presentation/play-surface';
import { ScenarioPresenterSurface } from './presentation/presenter';
import { ScenarioV3FloatingChrome } from './floating-chrome';
import type { useScenarioV3EditorState } from './state';
import type { useScenarioV3TemplateState } from './template-state';
import type { ScenarioV3EditorSaveStatus } from './types';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;
type ScenarioV3TemplateState = ReturnType<typeof useScenarioV3TemplateState>;
type ScenarioV3WorkspaceAssetState = ReturnType<typeof useScenarioV3RenderAssetState>;

type ScenarioV3WorkspaceProps = {
  canvasViewport: ScenarioCanvasViewportController;
  aiPanelOpen?: boolean;
  clickIndex: number;
  editor: ScenarioV3EditorState;
  elapsedSeconds: number;
  inspectorTool: 'export' | null;
  mode: ScenarioEditorMode;
  saveStatus?: ScenarioV3EditorSaveStatus | undefined;
  timelineHidden: boolean;
  templates: ScenarioV3TemplateState;
  templatePickerOpen: boolean;
  audienceOpening: boolean;
  onClickIndexChange: (clickIndex: number) => void;
  onClearInspectorTool: () => void;
  onEditImageElement: (elementId: string) => void;
  onModeChange: (mode: ScenarioEditorMode) => void;
  onOpenAudienceScreen: () => void;
  onOpenExport: () => void;
  onToggleAi: () => void;
  onTimelineHiddenChange: (hidden: boolean) => void;
  onToggleTemplatePicker: () => void;
  onPresentationPositionChange: (position: ScenarioPresentationPosition) => void;
};

export function ScenarioV3Workspace(props: ScenarioV3WorkspaceProps) {
  const assetState = useScenarioV3RenderAssetState(props.editor.project);
  const drawingDocument = useScenarioDrawingDocument(props.editor.selectedSlide.id);
  const [activeInsertKind, setActiveInsertKind] = useState<ScenarioV3ElementKind | null>(null);
  const rightPanelHidden = props.aiPanelOpen === true;
  useActiveCanvasInsertEscape({
    active: activeInsertKind !== null,
    onCancel: () => setActiveInsertKind(null),
  });

  if (props.mode !== SCENARIO_EDITOR_MODES.edit) {
    return (
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <ScenarioV3CenterSurface {...props} assetState={assetState} />
        {renderScenarioFloatingChrome({
          activeInsertKind: null,
          assetState,
          props,
          rightPanelHidden,
          setActiveInsertKind,
        })}
      </main>
    );
  }

  return (
    <main className="relative min-h-0 flex-1 overflow-hidden">
      <div className="absolute inset-0 min-h-0 min-w-0" data-ui="scenario.canvas.layer">
        <ScenarioV3CenterSurface
          {...props}
          activeInsertKind={activeInsertKind}
          assetState={assetState}
          drawingDocument={drawingDocument}
          onActiveInsertKindChange={setActiveInsertKind}
        />
      </div>
      {renderScenarioFloatingChrome({
        activeInsertKind,
        assetState,
        props,
        rightPanelHidden,
        setActiveInsertKind,
      })}
    </main>
  );
}

function renderScenarioFloatingChrome(args: {
  activeInsertKind: ScenarioV3ElementKind | null;
  assetState: ScenarioV3WorkspaceAssetState;
  props: ScenarioV3WorkspaceProps;
  rightPanelHidden: boolean;
  setActiveInsertKind: (kind: ScenarioV3ElementKind | null) => void;
}) {
  const { props } = args;
  return (
    <ScenarioV3FloatingChrome
      activeInsertKind={args.activeInsertKind}
      assets={args.assetState.assets}
      canvasControls={props.canvasViewport.controls}
      clickIndex={props.clickIndex}
      editor={props.editor}
      inspectorTool={props.inspectorTool}
      mode={props.mode}
      rightPanelHidden={args.rightPanelHidden}
      saveStatus={props.saveStatus}
      timelineHidden={props.timelineHidden}
      templatePickerOpen={props.templatePickerOpen}
      templates={props.templates}
      onClearInspectorTool={props.onClearInspectorTool}
      onClickIndexChange={props.onClickIndexChange}
      onEditImageElement={props.onEditImageElement}
      onModeChange={props.onModeChange}
      onOpenExport={props.onOpenExport}
      onPresentationPositionChange={props.onPresentationPositionChange}
      onToggleAi={props.onToggleAi}
      onActiveInsertKindChange={args.setActiveInsertKind}
      onTimelineHiddenChange={props.onTimelineHiddenChange}
      onToggleTemplatePicker={props.onToggleTemplatePicker}
    />
  );
}

function ScenarioV3CenterSurface(props: {
  activeInsertKind?: ScenarioV3ElementKind | null;
  assetState: { assets: ScenarioSlideRenderAssetMap; loading: boolean };
  canvasViewport: ScenarioCanvasViewportController;
  clickIndex: number;
  drawingDocument?: ScenarioDrawingDocument;
  editor: ScenarioV3EditorState;
  elapsedSeconds: number;
  mode: ScenarioEditorMode;
  audienceOpening: boolean;
  onActiveInsertKindChange?: (kind: ScenarioV3ElementKind | null) => void;
  onClickIndexChange: (clickIndex: number) => void;
  onClearInspectorTool: () => void;
  onEditImageElement: (elementId: string) => void;
  onModeChange: (mode: ScenarioEditorMode) => void;
  onOpenAudienceScreen: () => void;
  onPresentationPositionChange: (position: ScenarioPresentationPosition) => void;
}) {
  if (props.mode === SCENARIO_EDITOR_MODES.play) {
    return <PlaySurface {...props} assets={props.assetState.assets} />;
  }
  if (props.mode === SCENARIO_EDITOR_MODES.presenter) {
    return <PresenterSurface {...props} assets={props.assetState.assets} />;
  }
  if (props.mode === SCENARIO_EDITOR_MODES.overview) {
    return (
      <ScenarioOverviewSurface
        onSelectSlide={props.editor.slideActions.selectSlide}
        onExit={() => props.onModeChange(SCENARIO_EDITOR_MODES.edit)}
        selectedSlideId={props.editor.selectedSlide.id}
        slides={props.editor.project.slides}
        assets={props.assetState.assets}
      />
    );
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

function PresenterSurface(props: {
  assets: ScenarioSlideRenderAssetMap;
  clickIndex: number;
  editor: ScenarioV3EditorState;
  elapsedSeconds: number;
  audienceOpening: boolean;
  onClickIndexChange: (clickIndex: number) => void;
  onModeChange: (mode: ScenarioEditorMode) => void;
  onOpenAudienceScreen: () => void;
  onPresentationPositionChange: (position: ScenarioPresentationPosition) => void;
}) {
  const slideIndex = getScenarioPresentationSlideIndex(
    props.editor.project,
    props.editor.selectedSlide.id
  );
  return (
    <ScenarioPresenterSurface
      assets={props.assets}
      clickIndex={props.clickIndex}
      audienceOpening={props.audienceOpening}
      elapsedSeconds={props.elapsedSeconds}
      nextSlide={props.editor.project.slides[slideIndex + 1] ?? null}
      onNext={() => advanceScenarioPresentation(createPresentationActionController(props))}
      onOpenAudienceScreen={props.onOpenAudienceScreen}
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
  onPresentationPositionChange?: (position: ScenarioPresentationPosition) => void;
}) {
  return {
    clickIndex: props.clickIndex,
    onClickIndexChange: props.onClickIndexChange,
    ...(props.onPresentationPositionChange
      ? { onPositionChange: props.onPresentationPositionChange }
      : {}),
    project: props.editor.project,
    selectedSlideId: props.editor.selectedSlide.id,
    selectSlide: props.editor.slideActions.selectSlide,
  };
}
