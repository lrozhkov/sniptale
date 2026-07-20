import type {
  EditorPresetSettingsMap,
  EditorPresetStorageState,
  EditorSceneBackgroundSettings,
} from '../../../features/editor/document/presets';
import type { EditorShapeSettings, EditorTool } from '../../../features/editor/document/types';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import { useBorderPresetHeader } from './preset-header/border';
import { useEditorStoredPresetHeader } from './preset-header/editor';
import { pickSceneBackgroundSettings, resolveActiveToolPresetOwner } from './preset-header/shared';

type PresetHeaderArgs = {
  borderPresets: BorderPreset[];
  defaultBorderPresetId: string;
  editorPresetState: EditorPresetStorageState;
  toolSettings: {
    pencil: EditorPresetSettingsMap['pencil'];
    highlighter: EditorPresetSettingsMap['highlighter'];
    rectangle: EditorShapeSettings;
    ellipse: EditorPresetSettingsMap['ellipse'];
    blur: EditorPresetSettingsMap['blur'];
    arrow: EditorPresetSettingsMap['arrow'];
    line: EditorPresetSettingsMap['line'];
    text: EditorPresetSettingsMap['text'];
    step: EditorPresetSettingsMap['step'];
  };
  applyBrushPresetSettings: (
    tool: 'pencil' | 'highlighter',
    settings: EditorPresetSettingsMap['pencil']
  ) => void;
  applyShapePresetSettings: (owner: 'rectangle' | 'ellipse', settings: EditorShapeSettings) => void;
  applyBlurPresetSettings: (settings: EditorPresetSettingsMap['blur']) => void;
  applyArrowPresetSettings: (settings: EditorPresetSettingsMap['arrow']) => void;
  applyLinePresetSettings?: ((settings: EditorPresetSettingsMap['line']) => void) | undefined;
  applyTextPresetSettings: (settings: EditorPresetSettingsMap['text']) => void;
  applyStepPresetSettings: (settings: EditorPresetSettingsMap['step']) => void;
};

type SceneFrameDraft = {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  backgroundMode: string;
  backgroundColor: string;
  backgroundGradientFrom: string;
  backgroundGradientTo: string;
  backgroundGradientAngle: number;
  backgroundImageData: string | null;
  backgroundImageFit: string;
  layoutMode: string;
};

type EditorInspectorPresetHeadersArgs = {
  activeTool: EditorTool;
  borderPresets: BorderPreset[];
  defaultBorderPresetId: string;
  editorPresetState: EditorPresetStorageState;
  frameDraft: SceneFrameDraft;
  toolSettings: PresetHeaderArgs['toolSettings'];
  applyBrushPresetSettings: PresetHeaderArgs['applyBrushPresetSettings'];
  applyShapePresetSettings: PresetHeaderArgs['applyShapePresetSettings'];
  applyBlurPresetSettings: PresetHeaderArgs['applyBlurPresetSettings'];
  applyArrowPresetSettings: PresetHeaderArgs['applyArrowPresetSettings'];
  applyLinePresetSettings?: PresetHeaderArgs['applyLinePresetSettings'] | undefined;
  applyTextPresetSettings: PresetHeaderArgs['applyTextPresetSettings'];
  applyStepPresetSettings: PresetHeaderArgs['applyStepPresetSettings'];
  setFrameSettings: (settings: EditorSceneBackgroundSettings) => void;
};

function useBrushPresetHeaders(args: PresetHeaderArgs) {
  return {
    pencil: useEditorStoredPresetHeader({
      family: 'pencil',
      baseOwner: 'pencil',
      collection: args.editorPresetState.pencil,
      currentSettings: args.toolSettings.pencil,
      applySettings: (settings) => args.applyBrushPresetSettings('pencil', settings),
    }),
    highlighter: useEditorStoredPresetHeader({
      family: 'highlighter',
      baseOwner: 'highlighter',
      collection: args.editorPresetState.highlighter,
      currentSettings: args.toolSettings.highlighter,
      applySettings: (settings) => args.applyBrushPresetSettings('highlighter', settings),
    }),
  };
}

function useShapePresetHeaders(args: PresetHeaderArgs) {
  return {
    rectangle: useBorderPresetHeader({
      borderPresets: args.borderPresets,
      defaultBorderPresetId: args.defaultBorderPresetId,
      currentSettings: args.toolSettings.rectangle,
      applySettings: (settings) => args.applyShapePresetSettings('rectangle', settings),
    }),
    ellipse: useEditorStoredPresetHeader({
      family: 'ellipse',
      baseOwner: 'ellipse',
      collection: args.editorPresetState.ellipse,
      currentSettings: args.toolSettings.ellipse,
      applySettings: (settings) => args.applyShapePresetSettings('ellipse', settings),
    }),
    blur: useEditorStoredPresetHeader({
      family: 'blur',
      baseOwner: 'blur',
      collection: args.editorPresetState.blur,
      currentSettings: args.toolSettings.blur,
      applySettings: args.applyBlurPresetSettings,
    }),
  };
}

function useAnnotationPresetHeaders(args: PresetHeaderArgs) {
  return {
    arrow: useEditorStoredPresetHeader({
      family: 'arrow',
      baseOwner: 'arrow',
      collection: args.editorPresetState.arrow,
      currentSettings: args.toolSettings.arrow,
      applySettings: args.applyArrowPresetSettings,
    }),
    line: useEditorStoredPresetHeader({
      family: 'line',
      baseOwner: 'line',
      collection: args.editorPresetState.line,
      currentSettings: args.toolSettings.line,
      applySettings: args.applyLinePresetSettings ?? (() => undefined),
    }),
    text: useEditorStoredPresetHeader({
      family: 'text',
      baseOwner: 'text',
      collection: args.editorPresetState.text,
      currentSettings: args.toolSettings.text,
      applySettings: args.applyTextPresetSettings,
    }),
    step: useEditorStoredPresetHeader({
      family: 'step',
      baseOwner: 'step',
      collection: args.editorPresetState.step,
      currentSettings: args.toolSettings.step,
      applySettings: args.applyStepPresetSettings,
    }),
  };
}

function useToolPresetHeaders(args: PresetHeaderArgs) {
  return {
    ...useBrushPresetHeaders(args),
    ...useShapePresetHeaders(args),
    ...useAnnotationPresetHeaders(args),
  };
}

function useScenePresetHeader(
  args: Pick<
    EditorInspectorPresetHeadersArgs,
    'editorPresetState' | 'frameDraft' | 'setFrameSettings'
  >
) {
  return useEditorStoredPresetHeader({
    family: 'sceneBackground',
    baseOwner: 'sceneBackground',
    collection: args.editorPresetState.sceneBackground,
    currentSettings: pickSceneBackgroundSettings(args.frameDraft),
    applySettings: args.setFrameSettings,
  });
}

export function useEditorInspectorPresetHeaders(args: EditorInspectorPresetHeadersArgs) {
  const toolPresetOwner = resolveActiveToolPresetOwner(args.activeTool);
  const toolHeaders = useToolPresetHeaders(args);
  const scenePresetHeader = useScenePresetHeader(args);

  return {
    scenePresetHeader,
    toolPresetHeader: toolPresetOwner ? toolHeaders[toolPresetOwner] : null,
  };
}
