import type { EditorShapeSettings } from '../../../../features/editor/document/types';
import { sanitizeEditorShapeComparableSettings } from '../../../../features/editor/presets/settings';
import { translate } from '../../../../platform/i18n';
import {
  addBorderPreset,
  updateBorderPreset,
} from '../../../../composition/persistence/highlighter';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { BorderPreset } from '../../../../features/highlighter/contracts';
import { createBorderPresetFromShapeSettings } from '../border-preset';
import {
  buildPresetOverwriteSavePanelState,
  getPresetSavePanelControls,
  resolvePresetOverwriteTarget,
  type PresetSavePanelControls,
} from './shared';
import type { usePresetSaveDraft } from './shared';

type BorderSavePanelArgs = PresetSavePanelControls & {
  borderPresets: BorderPreset[];
  currentSettings: EditorShapeSettings;
  markClean: (settings: EditorShapeSettings, presetId: string) => void;
  setSelectedPresetId: (presetId: string) => void;
};

function resolveOverwritePreset(
  args: Pick<BorderSavePanelArgs, 'borderPresets' | 'overwriteTargetId'>
) {
  return resolvePresetOverwriteTarget(args.borderPresets, args.overwriteTargetId);
}

function createOverwritePreset(args: {
  borderPresets: BorderPreset[];
  currentSettings: EditorShapeSettings;
  overwritePreset: BorderPreset;
}): BorderPreset {
  return {
    ...createBorderPresetFromShapeSettings(args.currentSettings, args.borderPresets),
    id: args.overwritePreset.id,
    name: args.overwritePreset.name,
    order: args.overwritePreset.order,
    enabled: args.overwritePreset.enabled ?? true,
    padding: { ...args.overwritePreset.padding },
  };
}

async function saveExistingBorderPreset(args: {
  borderPresets: BorderPreset[];
  closeSavePanel: () => void;
  currentSettings: EditorShapeSettings;
  markClean: (settings: EditorShapeSettings, presetId: string) => void;
  overwritePreset: BorderPreset;
  setSelectedPresetId: (presetId: string) => void;
}) {
  try {
    await updateBorderPreset(
      createOverwritePreset({
        borderPresets: args.borderPresets,
        currentSettings: args.currentSettings,
        overwritePreset: args.overwritePreset,
      })
    );
  } catch {
    toast.error(translate('common.states.error'));
    return;
  }
  args.setSelectedPresetId(args.overwritePreset.id);
  args.markClean(
    sanitizeEditorShapeComparableSettings(args.currentSettings),
    args.overwritePreset.id
  );
  args.closeSavePanel();
}

async function saveNewBorderPreset(args: {
  borderPresets: BorderPreset[];
  closeSavePanel: () => void;
  currentSettings: EditorShapeSettings;
  markClean: (settings: EditorShapeSettings, presetId: string) => void;
  saveName: string;
  setSelectedPresetId: (presetId: string) => void;
}) {
  const preset = {
    ...createBorderPresetFromShapeSettings(args.currentSettings, args.borderPresets),
    name: args.saveName.trim(),
  };
  try {
    await addBorderPreset(preset);
  } catch {
    toast.error(translate('common.states.error'));
    return;
  }
  args.setSelectedPresetId(preset.id);
  args.markClean(sanitizeEditorShapeComparableSettings(args.currentSettings), preset.id);
  args.closeSavePanel();
}

function createBorderSaveAction(args: BorderSavePanelArgs) {
  return () => {
    if (args.saveMode === 'overwrite') {
      const overwritePreset = resolveOverwritePreset(args);
      if (!overwritePreset) {
        return;
      }

      void saveExistingBorderPreset({
        borderPresets: args.borderPresets,
        closeSavePanel: args.closeSavePanel,
        currentSettings: args.currentSettings,
        markClean: args.markClean,
        overwritePreset,
        setSelectedPresetId: args.setSelectedPresetId,
      });
      return;
    }

    void saveNewBorderPreset({
      borderPresets: args.borderPresets,
      closeSavePanel: args.closeSavePanel,
      currentSettings: args.currentSettings,
      markClean: args.markClean,
      saveName: args.saveName,
      setSelectedPresetId: args.setSelectedPresetId,
    });
  };
}

function buildSavePanel(args: BorderSavePanelArgs) {
  return buildPresetOverwriteSavePanelState({
    closeSavePanel: args.closeSavePanel,
    onSave: createBorderSaveAction(args),
    overwriteTargetId: args.overwriteTargetId,
    presets: args.borderPresets,
    saveMode: args.saveMode,
    saveName: args.saveName,
    setOverwriteTargetId: args.setOverwriteTargetId,
    setSaveMode: args.setSaveMode,
    setSaveName: args.setSaveName,
  });
}

export function buildBorderPresetSavePanel(args: {
  borderPresets: BorderPreset[];
  currentSettings: EditorShapeSettings;
  markClean: (settings: EditorShapeSettings, presetId: string) => void;
  saveDraft: ReturnType<typeof usePresetSaveDraft>;
  setSelectedPresetId: (presetId: string) => void;
}) {
  return buildSavePanel({
    borderPresets: args.borderPresets,
    currentSettings: args.currentSettings,
    markClean: args.markClean,
    setSelectedPresetId: args.setSelectedPresetId,
    ...getPresetSavePanelControls(args.saveDraft),
  });
}
