import type {
  EditorPresetStorageState,
  EditorSceneBackgroundSettings,
} from '../../../features/editor/document/presets';
import type { EditorFrameSettings, EditorTool } from '../../../features/editor/document/types';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { useEditorStoredPresetHeader } from './preset-header/editor';
import { pickSceneBackgroundSettings } from './preset-header/shared';

export function useEditorInspectorPresetHeaders(args: {
  activeTool: EditorTool;
  editorPresetState: EditorPresetStorageState;
  frameDraft: EditorFrameSettings;
  toolSettings: EditorToolSettings;
  applyStepPresetSettings: (settings: EditorToolSettings['step']) => void;
  setFrameSettings: (settings: EditorSceneBackgroundSettings) => void;
}) {
  const step = useEditorStoredPresetHeader({
    family: 'step',
    baseOwner: 'step',
    collection: args.editorPresetState.step,
    currentSettings: args.toolSettings.step,
    applySettings: args.applyStepPresetSettings,
  });
  const scenePresetHeader = useEditorStoredPresetHeader({
    family: 'sceneBackground',
    baseOwner: 'sceneBackground',
    collection: args.editorPresetState.sceneBackground,
    currentSettings: pickSceneBackgroundSettings(args.frameDraft),
    applySettings: args.setFrameSettings,
  });
  return {
    scenePresetHeader,
    toolPresetHeader: args.activeTool === 'step' ? step : null,
  };
}
