import type { EditorShapeSettings } from '../../../../features/editor/document/types';
import { getEditorPresetDisplayName } from '../../../../features/editor/presets/display';
import { sanitizeEditorShapeComparableSettings } from '../../../../features/editor/presets/settings';
import { projectBorderPresetToEditorShapeSettings } from '../../../../features/editor/document/public';
import type { BorderPreset } from '../../../../features/highlighter/contracts';
import type {
  EditorInspectorPresetHeaderState,
  EditorInspectorTemplateCardState,
} from '../../presets';
import { useEditorInspectorTemplateViewMode } from '../../presets';
import { renderBorderPresetPreview } from '../../presets/preview';
import { createEditorInspectorTemplateGroups } from '../../presets/template-groups';
import { buildBorderPresetSavePanel } from './border-save';
import { findMatchingPreset, getEnabledPresets } from './matching';
import { getPresetBaseName, usePresetMatchState, usePresetSaveDraft } from './shared';

function createBorderPresetApplyHandler(args: {
  applySettings: (settings: EditorShapeSettings) => void;
  closeSavePanel: () => void;
  markClean: (settings: EditorShapeSettings, presetId: string) => void;
  preset: BorderPreset;
}) {
  return () => {
    const settings = projectBorderPresetToEditorShapeSettings(args.preset);
    args.closeSavePanel();
    args.applySettings(settings);
    args.markClean(sanitizeEditorShapeComparableSettings(settings), args.preset.id);
  };
}

function buildBorderTemplateCards(args: {
  applySettings: (settings: EditorShapeSettings) => void;
  closeSavePanel: () => void;
  enabledPresets: BorderPreset[];
  markClean: (settings: EditorShapeSettings, presetId: string) => void;
  selectedPresetId: string | undefined;
}): EditorInspectorTemplateCardState[] {
  return args.enabledPresets.map((preset) => ({
    id: preset.id,
    label: getEditorPresetDisplayName(preset),
    preview: renderBorderPresetPreview(preset),
    selected: preset.id === args.selectedPresetId,
    ...(preset.isSystemDefault ? { system: true } : {}),
    onApply: createBorderPresetApplyHandler({
      applySettings: args.applySettings,
      closeSavePanel: args.closeSavePanel,
      markClean: args.markClean,
      preset,
    }),
  }));
}

function getComparableBorderPresetSettings(preset: BorderPreset) {
  return sanitizeEditorShapeComparableSettings(projectBorderPresetToEditorShapeSettings(preset));
}

function useBorderPresetHeaderModel(args: {
  applySettings: (settings: EditorShapeSettings) => void;
  borderPresets: BorderPreset[];
  currentSettings: EditorShapeSettings;
}) {
  const enabledPresets = getEnabledPresets(args.borderPresets);
  const comparableCurrentSettings = sanitizeEditorShapeComparableSettings(args.currentSettings);
  const matchingPreset = findMatchingPreset({
    currentSettings: comparableCurrentSettings,
    getPresetSettings: getComparableBorderPresetSettings,
    presets: args.borderPresets,
  });
  const matchState = usePresetMatchState({
    currentSettings: comparableCurrentSettings,
    matchingPresetId: matchingPreset?.id,
  });
  const saveDraft = usePresetSaveDraft(
    getPresetBaseName('rectangle'),
    args.borderPresets.map((preset) => preset.name)
  );
  const { viewMode, setViewMode } = useEditorInspectorTemplateViewMode('rectangle');
  const savePanel = saveDraft.savePanelOpen
    ? buildBorderPresetSavePanel({
        borderPresets: args.borderPresets,
        currentSettings: args.currentSettings,
        markClean: matchState.markClean,
        saveDraft,
        setSelectedPresetId: () => undefined,
      })
    : null;

  const templates = buildBorderTemplateCards({
    applySettings: args.applySettings,
    closeSavePanel: saveDraft.closeSavePanel,
    enabledPresets,
    markClean: matchState.markClean,
    selectedPresetId: matchState.selectedPresetId,
  });

  return {
    activeView: viewMode,
    groups: createEditorInspectorTemplateGroups(templates),
    onOpenSavePanel: saveDraft.openSavePanel,
    onViewChange: setViewMode,
    saveDisabled: matchState.saveDisabled,
    savePanel,
    templates,
  };
}

export function useBorderPresetHeader(args: {
  applySettings: (settings: EditorShapeSettings) => void;
  borderPresets: BorderPreset[];
  currentSettings: EditorShapeSettings;
  defaultBorderPresetId: string;
}): EditorInspectorPresetHeaderState {
  return useBorderPresetHeaderModel(args);
}
