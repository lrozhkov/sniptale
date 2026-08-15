import { useEffect, useState } from 'react';

import type { EditorSceneBackgroundSettings } from '../../../../features/editor/document/presets';
import { normalizeEditorImageSettings } from '../../../../features/editor/document/constants';
import { translate } from '../../../../platform/i18n';
import { getPresetSettingsSignature } from './matching';

type SaveMode = 'create' | 'overwrite';
export type ActiveToolPresetOwner = 'step';

export type PresetSavePanelControls = {
  closeSavePanel: () => void;
  overwriteTargetId: string;
  saveMode: SaveMode;
  saveName: string;
  setOverwriteTargetId: (presetId: string) => void;
  setSaveMode: (mode: SaveMode) => void;
  setSaveName: (name: string) => void;
};

type PresetOverwriteCandidate = {
  enabled?: boolean;
  id: string;
  isSystemDefault?: boolean;
  name: string;
  origin?: 'system' | 'user';
};

export function getPresetSavePanelControls(
  saveDraft: ReturnType<typeof usePresetSaveDraft>
): PresetSavePanelControls {
  return {
    closeSavePanel: saveDraft.closeSavePanel,
    overwriteTargetId: saveDraft.overwriteTargetId,
    saveMode: saveDraft.saveMode,
    saveName: saveDraft.saveName,
    setOverwriteTargetId: saveDraft.setOverwriteTargetId,
    setSaveMode: saveDraft.setSaveMode,
    setSaveName: saveDraft.setSaveName,
  };
}

function getPresetOverwriteCandidates<TPreset extends PresetOverwriteCandidate>(
  presets: readonly TPreset[]
): TPreset[] {
  return presets.filter(
    (preset) =>
      preset.enabled !== false && preset.isSystemDefault !== true && preset.origin !== 'system'
  );
}

function buildPresetOverwriteOptions<TPreset extends PresetOverwriteCandidate>(
  presets: readonly TPreset[]
) {
  return getPresetOverwriteCandidates(presets).map((preset) => ({
    label: preset.name,
    value: preset.id,
  }));
}

export function resolvePresetOverwriteTarget<TPreset extends PresetOverwriteCandidate>(
  presets: readonly TPreset[],
  overwriteTargetId: string
): TPreset | undefined {
  const overwritePresets = getPresetOverwriteCandidates(presets);
  return overwritePresets.find((preset) => preset.id === overwriteTargetId) ?? overwritePresets[0];
}

function buildPresetSavePanelState(
  args: PresetSavePanelControls & {
    onSave: () => void;
    overwriteOptions: Array<{ label: string; value: string }>;
    overwriteDisabled: boolean;
  }
) {
  return {
    canSave:
      args.saveMode === 'overwrite'
        ? !args.overwriteDisabled && args.overwriteTargetId.length > 0
        : args.saveName.trim().length > 0,
    mode: args.saveMode,
    name: args.saveName,
    overwriteOptions: args.overwriteOptions,
    overwriteDisabled: args.overwriteDisabled,
    ...(args.overwriteDisabled
      ? { overwriteHint: translate('editor.compact.templateOverwriteUnavailableHint') }
      : {}),
    overwriteTargetId: args.overwriteTargetId,
    onCancel: args.closeSavePanel,
    onModeChange: args.setSaveMode,
    onNameChange: args.setSaveName,
    onOverwriteTargetChange: args.setOverwriteTargetId,
    onSave: args.onSave,
  };
}

export function buildPresetOverwriteSavePanelState<TPreset extends PresetOverwriteCandidate>(
  args: PresetSavePanelControls & {
    onSave: () => void;
    presets: readonly TPreset[];
  }
) {
  const overwriteOptions = buildPresetOverwriteOptions(args.presets);
  const effectiveOverwriteTargetId = args.overwriteTargetId || overwriteOptions[0]?.value || '';

  return buildPresetSavePanelState({
    closeSavePanel: args.closeSavePanel,
    onSave: args.onSave,
    overwriteDisabled: overwriteOptions.length === 0,
    overwriteOptions,
    overwriteTargetId: effectiveOverwriteTargetId,
    saveMode: args.saveMode,
    saveName: args.saveName,
    setOverwriteTargetId: args.setOverwriteTargetId,
    setSaveMode: (mode) => {
      args.setSaveMode(mode);
      if (mode === 'overwrite' && !args.overwriteTargetId && overwriteOptions[0]) {
        args.setOverwriteTargetId(overwriteOptions[0].value);
      }
    },
    setSaveName: args.setSaveName,
  });
}

function createPresetName(baseName: string, names: readonly string[]): string {
  let index = 1;
  const existingNames = new Set(names);

  while (existingNames.has(`${baseName} ${index}`)) {
    index++;
  }

  return `${baseName} ${index}`;
}

export function getPresetBaseName(owner: ActiveToolPresetOwner | 'sceneBackground'): string {
  switch (owner) {
    case 'step':
      return translate(`editor.tools.${owner}`);
    case 'sceneBackground':
      return translate('editor.scene.sceneBackgroundTitle');
  }
}

export function pickSceneBackgroundSettings(frameDraft: {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  backgroundMode: string;
  backgroundBlurAmount: number;
  backgroundColor: string;
  backgroundGradientFrom: string;
  backgroundGradientTo: string;
  backgroundGradientStops?: string[] | undefined;
  backgroundGradientColorStops?:
    | EditorSceneBackgroundSettings['backgroundGradientColorStops']
    | undefined;
  backgroundGradientAngle: number;
  backgroundImageData: string | null;
  backgroundImageFit: string;
  sourceImage?: EditorSceneBackgroundSettings['sourceImage'] | undefined;
  layoutMode: string;
}): EditorSceneBackgroundSettings {
  return {
    paddingTop: frameDraft.paddingTop,
    paddingRight: frameDraft.paddingRight,
    paddingBottom: frameDraft.paddingBottom,
    paddingLeft: frameDraft.paddingLeft,
    backgroundMode: frameDraft.backgroundMode as EditorSceneBackgroundSettings['backgroundMode'],
    backgroundBlurAmount: frameDraft.backgroundBlurAmount,
    backgroundColor: frameDraft.backgroundColor,
    backgroundGradientFrom: frameDraft.backgroundGradientFrom,
    backgroundGradientTo: frameDraft.backgroundGradientTo,
    backgroundGradientStops: frameDraft.backgroundGradientStops,
    backgroundGradientColorStops: frameDraft.backgroundGradientColorStops,
    backgroundGradientAngle: frameDraft.backgroundGradientAngle,
    backgroundImageData: frameDraft.backgroundImageData,
    backgroundImageFit:
      frameDraft.backgroundImageFit as EditorSceneBackgroundSettings['backgroundImageFit'],
    sourceImage: normalizeEditorImageSettings(frameDraft.sourceImage),
    layoutMode: frameDraft.layoutMode as EditorSceneBackgroundSettings['layoutMode'],
  };
}

export function usePresetMatchState<TSettings>(args: {
  currentSettings: TSettings;
  matchingPresetId: string | undefined;
}) {
  const currentSignature = getPresetSettingsSignature(args.currentSettings);
  const [pendingCleanMatch, setPendingCleanMatch] = useState<{
    presetId: string;
    signature: string;
  } | null>(null);
  const matched = args.matchingPresetId !== undefined;
  const cleanByPending = pendingCleanMatch?.signature === currentSignature;

  useEffect(() => {
    if (pendingCleanMatch === null) {
      return;
    }

    if (matched || pendingCleanMatch.signature !== currentSignature) {
      setPendingCleanMatch(null);
    }
  }, [currentSignature, matched, pendingCleanMatch]);

  return {
    selectedPresetId:
      args.matchingPresetId ?? (cleanByPending ? pendingCleanMatch?.presetId : undefined),
    saveDisabled: matched || cleanByPending,
    markClean: (settings: TSettings, presetId: string) => {
      setPendingCleanMatch({
        presetId,
        signature: getPresetSettingsSignature(settings),
      });
    },
  };
}

export function usePresetSaveDraft(baseName: string, presetNames: readonly string[]) {
  const [savePanelOpen, setSavePanelOpen] = useState(false);
  const [saveMode, setSaveMode] = useState<SaveMode>('create');
  const [saveName, setSaveName] = useState('');
  const [overwriteTargetId, setOverwriteTargetId] = useState('');

  return {
    overwriteTargetId,
    saveMode,
    saveName,
    savePanelOpen,
    setOverwriteTargetId,
    setSaveMode,
    setSaveName,
    closeSavePanel: () => setSavePanelOpen(false),
    openSavePanel: () => {
      setSaveMode('create');
      setSaveName(createPresetName(baseName, presetNames));
      setOverwriteTargetId('');
      setSavePanelOpen(true);
    },
  };
}
