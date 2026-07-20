import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';
import type { ScenarioCanvasViewportController } from '../../canvas/viewport-state';
import type { useScenarioV3EditorState } from '../state';
import type { useScenarioV3TemplateState } from '../template-state';
import type { ScenarioEditorMode } from '../presentation/mode';
import type { ScenarioPresentationPosition } from '../presentation/navigation';
import type { ScenarioV3EditorSaveStatus } from '../types';
import type { ScenarioV3ElementKind } from '@sniptale/runtime-contracts/scenario/types/v3';

export type ScenarioV3FloatingEditor = ReturnType<typeof useScenarioV3EditorState>;
export type ScenarioV3FloatingTemplateState = ReturnType<typeof useScenarioV3TemplateState>;

export interface ScenarioV3FloatingChromeProps {
  activeInsertKind: ScenarioV3ElementKind | null;
  assets: ScenarioSlideRenderAssetMap;
  canvasControls: ScenarioCanvasViewportController['controls'];
  clickIndex: number;
  editor: ScenarioV3FloatingEditor;
  inspectorTool: 'export' | null;
  mode: ScenarioEditorMode;
  rightPanelHidden?: boolean;
  saveStatus?: ScenarioV3EditorSaveStatus | undefined;
  timelineHidden: boolean;
  templatePickerOpen: boolean;
  templates: ScenarioV3FloatingTemplateState;
  onClearInspectorTool: () => void;
  onActiveInsertKindChange: (kind: ScenarioV3ElementKind | null) => void;
  onClickIndexChange: (clickIndex: number) => void;
  onEditImageElement: (elementId: string) => void;
  onModeChange: (mode: ScenarioEditorMode) => void;
  onOpenExport: () => void;
  onTimelineHiddenChange: (hidden: boolean) => void;
  onToggleAi: () => void;
  onToggleTemplatePicker: () => void;
  onPresentationPositionChange: (position: ScenarioPresentationPosition) => void;
}
