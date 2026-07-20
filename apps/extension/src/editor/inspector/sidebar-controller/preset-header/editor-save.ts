import type {
  EditorPresetCollection,
  EditorPresetFamily,
  EditorPresetSettingsMap,
} from '../../../../features/editor/document/presets';
import {
  sanitizeEditorComparableSettings,
  sanitizeEditorPresetSettings,
} from '../../../../features/editor/presets/settings';
import { translate } from '../../../../platform/i18n';
import {
  addEditorPreset,
  updateEditorPreset,
} from '../../../../composition/persistence/editor-presets';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import {
  buildPresetOverwriteSavePanelState,
  getPresetSavePanelControls,
  resolvePresetOverwriteTarget,
  type PresetSavePanelControls,
} from './shared';
import type { usePresetSaveDraft } from './shared';

export type StoredEditorPreset<TKey extends EditorPresetFamily> = EditorPresetCollection<
  EditorPresetSettingsMap[TKey]
>['presets'][number];

type StoredPresetSavePanelArgs<TKey extends EditorPresetFamily> = PresetSavePanelControls & {
  collection: EditorPresetCollection<EditorPresetSettingsMap[TKey]>;
  currentSettings: EditorPresetSettingsMap[TKey];
  family: TKey;
  markClean: (settings: EditorPresetSettingsMap[TKey], presetId: string) => void;
  setSelectedPresetId: (presetId: string) => void;
};

function resolveOverwritePreset<TKey extends EditorPresetFamily>(
  args: Pick<StoredPresetSavePanelArgs<TKey>, 'collection' | 'overwriteTargetId'>
) {
  return resolvePresetOverwriteTarget(args.collection.presets, args.overwriteTargetId);
}

async function saveExistingPreset<TKey extends EditorPresetFamily>(args: {
  closeSavePanel: () => void;
  currentSettings: EditorPresetSettingsMap[TKey];
  family: TKey;
  markClean: (settings: EditorPresetSettingsMap[TKey], presetId: string) => void;
  overwritePreset: StoredEditorPreset<TKey>;
  setSelectedPresetId: (presetId: string) => void;
}) {
  const nextSettings = sanitizeEditorPresetSettings(args.family, args.currentSettings);
  const comparableSettings = sanitizeEditorComparableSettings(args.family, nextSettings);
  try {
    await updateEditorPreset(args.family, {
      ...args.overwritePreset,
      settings: nextSettings,
    });
  } catch {
    toast.error(translate('common.states.error'));
    return;
  }
  args.setSelectedPresetId(args.overwritePreset.id);
  args.markClean(comparableSettings, args.overwritePreset.id);
  args.closeSavePanel();
}

async function saveNewPreset<TKey extends EditorPresetFamily>(args: {
  closeSavePanel: () => void;
  collection: EditorPresetCollection<EditorPresetSettingsMap[TKey]>;
  currentSettings: EditorPresetSettingsMap[TKey];
  family: TKey;
  markClean: (settings: EditorPresetSettingsMap[TKey], presetId: string) => void;
  saveName: string;
  setSelectedPresetId: (presetId: string) => void;
}) {
  const nextSettings = sanitizeEditorPresetSettings(args.family, args.currentSettings);
  const comparableSettings = sanitizeEditorComparableSettings(args.family, nextSettings);
  const preset = {
    id: crypto.randomUUID(),
    name: args.saveName.trim(),
    order:
      args.collection.presets.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
    enabled: true,
    settings: nextSettings,
  };
  try {
    await addEditorPreset(args.family, preset);
  } catch {
    toast.error(translate('common.states.error'));
    return;
  }
  args.setSelectedPresetId(preset.id);
  args.markClean(comparableSettings, preset.id);
  args.closeSavePanel();
}

function createSaveAction<TKey extends EditorPresetFamily>(args: StoredPresetSavePanelArgs<TKey>) {
  return () => {
    if (args.saveMode === 'overwrite') {
      const overwritePreset = resolveOverwritePreset(args);
      if (!overwritePreset) {
        return;
      }

      void saveExistingPreset({
        closeSavePanel: args.closeSavePanel,
        currentSettings: args.currentSettings,
        family: args.family,
        markClean: args.markClean,
        overwritePreset,
        setSelectedPresetId: args.setSelectedPresetId,
      });
      return;
    }

    void saveNewPreset({
      closeSavePanel: args.closeSavePanel,
      collection: args.collection,
      currentSettings: args.currentSettings,
      family: args.family,
      markClean: args.markClean,
      saveName: args.saveName,
      setSelectedPresetId: args.setSelectedPresetId,
    });
  };
}

function buildSavePanel<TKey extends EditorPresetFamily>(args: StoredPresetSavePanelArgs<TKey>) {
  return buildPresetOverwriteSavePanelState({
    closeSavePanel: args.closeSavePanel,
    onSave: createSaveAction(args),
    overwriteTargetId: args.overwriteTargetId,
    presets: args.collection.presets,
    saveMode: args.saveMode,
    saveName: args.saveName,
    setOverwriteTargetId: args.setOverwriteTargetId,
    setSaveMode: args.setSaveMode,
    setSaveName: args.setSaveName,
  });
}

export function buildStoredPresetSavePanel<TKey extends EditorPresetFamily>(args: {
  collection: EditorPresetCollection<EditorPresetSettingsMap[TKey]>;
  currentSettings: EditorPresetSettingsMap[TKey];
  family: TKey;
  markClean: (settings: EditorPresetSettingsMap[TKey], presetId: string) => void;
  saveDraft: ReturnType<typeof usePresetSaveDraft>;
  setSelectedPresetId: (presetId: string) => void;
}) {
  return buildSavePanel({
    collection: args.collection,
    currentSettings: args.currentSettings,
    family: args.family,
    markClean: args.markClean,
    setSelectedPresetId: args.setSelectedPresetId,
    ...getPresetSavePanelControls(args.saveDraft),
  });
}
