import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';
import type { ScenarioCanvasViewportController } from '../../canvas/viewport-state';
import type { useScenarioV3EditorState } from '../state';
import type { ScenarioEditorMode } from '../presentation/mode';
import type { ScenarioV3EditorSaveStatus } from '../types';

export type ScenarioV3FloatingEditor = ReturnType<typeof useScenarioV3EditorState>;

export interface ScenarioV3FloatingChromeProps {
  assets: ScenarioSlideRenderAssetMap;
  canvasControls: ScenarioCanvasViewportController['controls'];
  editor: ScenarioV3FloatingEditor;
  inspectorTool: 'export' | null;
  mode: ScenarioEditorMode;
  rightPanelHidden?: boolean;
  saveStatus?: ScenarioV3EditorSaveStatus | undefined;
  onClearInspectorTool: () => void;
  onEditImageElement: (elementId: string) => void;
  onModeChange: (mode: ScenarioEditorMode) => void;
  onOpenExport: () => void;
  onToggleAi: () => void;
}
