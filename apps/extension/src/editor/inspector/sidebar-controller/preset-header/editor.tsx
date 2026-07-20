import type {
  EditorPresetCollection,
  EditorPresetFamily,
  EditorPresetSettingsMap,
} from '../../../../features/editor/document/presets';
import { getEditorPresetDisplayName } from '../../../../features/editor/presets/display';
import {
  sanitizeEditorComparableSettings,
  sanitizeEditorPresetSettings,
} from '../../../../features/editor/presets/settings';
import type {
  EditorInspectorPresetHeaderState,
  EditorInspectorTemplateCardState,
} from '../../presets';
import { useEditorInspectorTemplateViewMode } from '../../presets';
import { renderEditorPresetPreview } from '../../presets/preview';
import { createEditorInspectorTemplateGroups } from '../../presets/template-groups';
import { buildStoredPresetSavePanel, type StoredEditorPreset } from './editor-save';
import { findMatchingPreset, getEnabledPresets } from './matching';
import {
  getPresetBaseName,
  type ActiveToolPresetOwner,
  usePresetMatchState,
  usePresetSaveDraft,
} from './shared';

type StoredPresetMatchState<TKey extends EditorPresetFamily> = {
  markClean: (settings: EditorPresetSettingsMap[TKey], presetId: string) => void;
  saveDisabled: boolean;
  selectedPresetId: string | undefined;
};

function createTemplateApplyHandler<TKey extends EditorPresetFamily>(args: {
  applySettings: (settings: EditorPresetSettingsMap[TKey]) => void;
  closeSavePanel: () => void;
  family: TKey;
  markClean: (settings: EditorPresetSettingsMap[TKey], presetId: string) => void;
  preset: StoredEditorPreset<TKey>;
}) {
  return () => {
    const settings = sanitizeEditorPresetSettings(args.family, args.preset.settings);
    args.closeSavePanel();
    args.applySettings(settings);
    args.markClean(sanitizeEditorComparableSettings(args.family, settings), args.preset.id);
  };
}

function buildTemplateCards<TKey extends EditorPresetFamily>(args: {
  applySettings: (settings: EditorPresetSettingsMap[TKey]) => void;
  closeSavePanel: () => void;
  enabledPresets: Array<StoredEditorPreset<TKey>>;
  family: TKey;
  markClean: (settings: EditorPresetSettingsMap[TKey], presetId: string) => void;
  selectedPresetId: string | undefined;
}): EditorInspectorTemplateCardState[] {
  return args.enabledPresets.map((preset) => ({
    id: preset.id,
    label: getEditorPresetDisplayName(preset),
    preview: renderEditorPresetPreview(args.family, preset),
    selected: preset.id === args.selectedPresetId,
    ...(preset.isSystemDefault ? { system: true } : {}),
    onApply: createTemplateApplyHandler({
      applySettings: args.applySettings,
      closeSavePanel: args.closeSavePanel,
      family: args.family,
      markClean: args.markClean,
      preset,
    }),
  }));
}

function getComparablePresetSettings<TKey extends EditorPresetFamily>(
  family: TKey,
  preset: StoredEditorPreset<TKey>
) {
  return sanitizeEditorComparableSettings(family, preset.settings);
}

function useStoredPresetHeaderModel<TKey extends EditorPresetFamily>(args: {
  applySettings: (settings: EditorPresetSettingsMap[TKey]) => void;
  baseOwner: Exclude<ActiveToolPresetOwner, null> | 'sceneBackground';
  collection: EditorPresetCollection<EditorPresetSettingsMap[TKey]>;
  currentSettings: EditorPresetSettingsMap[TKey];
  family: TKey;
}) {
  const enabledPresets = getEnabledPresets(args.collection.presets);
  const comparableCurrentSettings = sanitizeEditorComparableSettings(
    args.family,
    args.currentSettings
  );
  const matchingPreset = findMatchingPreset({
    currentSettings: comparableCurrentSettings,
    getPresetSettings: (preset: StoredEditorPreset<TKey>) =>
      getComparablePresetSettings(args.family, preset),
    presets: args.collection.presets,
  });
  const matchState = usePresetMatchState({
    currentSettings: comparableCurrentSettings,
    matchingPresetId: matchingPreset?.id,
  });
  const saveDraft = usePresetSaveDraft(
    getPresetBaseName(args.baseOwner),
    args.collection.presets.map((preset) => preset.name)
  );
  const { viewMode, setViewMode } = useEditorInspectorTemplateViewMode(args.baseOwner);
  const savePanel = createStoredPresetSavePanel({ args, matchState, saveDraft });
  const templates = createStoredPresetTemplateCards({
    args,
    enabledPresets,
    matchState,
    saveDraft,
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

function createStoredPresetSavePanel<TKey extends EditorPresetFamily>(params: {
  args: Parameters<typeof useStoredPresetHeaderModel<TKey>>[0];
  matchState: StoredPresetMatchState<TKey>;
  saveDraft: ReturnType<typeof usePresetSaveDraft>;
}) {
  if (!params.saveDraft.savePanelOpen) {
    return null;
  }
  return buildStoredPresetSavePanel({
    collection: params.args.collection,
    currentSettings: params.args.currentSettings,
    family: params.args.family,
    markClean: params.matchState.markClean,
    saveDraft: params.saveDraft,
    setSelectedPresetId: () => undefined,
  });
}

function createStoredPresetTemplateCards<TKey extends EditorPresetFamily>(params: {
  args: Parameters<typeof useStoredPresetHeaderModel<TKey>>[0];
  enabledPresets: Array<StoredEditorPreset<TKey>>;
  matchState: StoredPresetMatchState<TKey>;
  saveDraft: ReturnType<typeof usePresetSaveDraft>;
}) {
  return buildTemplateCards({
    applySettings: params.args.applySettings,
    closeSavePanel: params.saveDraft.closeSavePanel,
    enabledPresets: params.enabledPresets,
    family: params.args.family,
    markClean: params.matchState.markClean,
    selectedPresetId: params.matchState.selectedPresetId,
  });
}

export function useEditorStoredPresetHeader<TKey extends EditorPresetFamily>(args: {
  applySettings: (settings: EditorPresetSettingsMap[TKey]) => void;
  baseOwner: Exclude<ActiveToolPresetOwner, null> | 'sceneBackground';
  collection: EditorPresetCollection<EditorPresetSettingsMap[TKey]>;
  currentSettings: EditorPresetSettingsMap[TKey];
  family: TKey;
}): EditorInspectorPresetHeaderState {
  return useStoredPresetHeaderModel(args);
}
