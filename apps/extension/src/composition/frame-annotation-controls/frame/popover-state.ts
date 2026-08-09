import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  applyManualBorderStylePatch,
  cloneBorderPresetEffects,
  projectBorderPresetToAppliedSettings,
} from '@sniptale/runtime-contracts/highlighter/border-preset';
import type {
  BorderPreset,
  BorderVisualStylePatch,
  HighlighterSettings,
} from '../../../features/highlighter/contracts';
import {
  addBorderPresetWithOutcome,
  loadHighlighterSettings,
  setBorderPresetEnabled,
  updateBorderPresetWithOutcome,
} from '../../persistence/highlighter';
import type { FrameAnnotationStyleSettings } from '../contracts';
import {
  createSessionVisibleBorderPresetIds,
  mergeSessionVisibleBorderPresetIds,
  selectSessionVisibleBorderPresets,
} from '../../../features/highlighter/presets/session-visible';

export function useFrameCreationPopoverState(props: {
  isOpen: boolean;
  onChange: (settings: FrameAnnotationStyleSettings) => void;
  settings: FrameAnnotationStyleSettings;
}) {
  const [catalog, setCatalog] = useState<HighlighterSettings | null>(null);
  const [visiblePresetIds, setVisiblePresetIds] = useState<string[]>([]);
  const [pendingPresetIds, setPendingPresetIds] = useState<ReadonlySet<string>>(() => new Set());
  const [cssDraft, setCssDraft] = useState(props.settings.borderSettings.customCss);
  const [editingPreset, setEditingPreset] = useState<BorderPreset>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!props.isOpen) {
      setEditorOpen(false);
      return;
    }
    setCssDraft(props.settings.borderSettings.customCss);
    void refreshCatalog(setCatalog, setVisiblePresetIds, true);
  }, [props.isOpen, props.settings.borderSettings.customCss]);
  const globalSettings = useMemo(() => {
    const settings = catalog ?? createCatalogFallback(props.settings);
    return {
      ...settings,
      borderPresets: selectSessionVisibleBorderPresets(settings, visiblePresetIds),
    };
  }, [catalog, props.settings, visiblePresetIds]);
  const apply = (patch: Partial<FrameAnnotationStyleSettings>) =>
    props.onChange({ ...props.settings, ...patch });
  const applyBorderPatch = (patch: BorderVisualStylePatch) =>
    applyBorderStylePatch(props.settings, patch, apply);
  const selectPreset = (preset: BorderPreset) => selectBorderPreset(props.settings, preset, apply);
  const forkPreset = (preset: BorderPreset) => forkBorderPreset(props.settings, preset, apply);
  const savePreset = (input: {
    name?: string;
    overwrite?: BorderPreset;
    tagIds?: readonly string[];
  }) =>
    saveBorderPreset(
      input,
      props.settings,
      setSaving,
      setCatalog,
      setVisiblePresetIds,
      selectPreset
    );
  const togglePresetEnabled = (preset: BorderPreset) =>
    void togglePreset(
      preset,
      pendingPresetIds,
      setPendingPresetIds,
      setCatalog,
      setVisiblePresetIds
    );
  const saveEdited = (preset: BorderPreset) =>
    void saveEditedPreset(
      preset,
      setSaving,
      setCatalog,
      setVisiblePresetIds,
      selectPreset,
      setEditorOpen
    );
  return {
    border: {
      apply,
      applyPatch: applyBorderPatch,
      forkPreset,
      selectPreset,
    },
    catalog: {
      pendingPresetIds,
      refresh: () => refreshCatalog(setCatalog, setVisiblePresetIds, false),
      settings: globalSettings,
      togglePresetEnabled,
    },
    css: {
      draft: cssDraft,
      setDraft: setCssDraft,
    },
    presetEditor: {
      editingPreset,
      isOpen: editorOpen,
      saveEdited,
      setEditingPreset,
      setOpen: setEditorOpen,
    },
    presetSaving: {
      isSaving: saving,
      save: savePreset,
    },
  };
}

function applyBorderStylePatch(
  settings: FrameAnnotationStyleSettings,
  patch: BorderVisualStylePatch,
  apply: (patch: Partial<FrameAnnotationStyleSettings>) => void
) {
  const effects = patch.effects ? cloneBorderPresetEffects(patch.effects) : null;
  apply({
    borderSettings: applyManualBorderStylePatch(settings.borderSettings, patch),
    ...(effects
      ? {
          blurSettings: { ...settings.blurSettings, ...effects.blur, showBorder: true },
          focusSettings: {
            ...settings.focusSettings,
            blurAmount: effects.focus.blurAmount,
            opacity: effects.focus.opacity,
            showBorder: true,
          },
        }
      : {}),
  });
}

function selectBorderPreset(
  settings: FrameAnnotationStyleSettings,
  preset: BorderPreset,
  apply: (patch: Partial<FrameAnnotationStyleSettings>) => void
) {
  const effects = cloneBorderPresetEffects(preset.effects);
  apply({
    borderSettings: projectBorderPresetToAppliedSettings(preset),
    blurSettings: { ...settings.blurSettings, ...effects.blur, showBorder: true },
    focusSettings: {
      ...settings.focusSettings,
      blurAmount: effects.focus.blurAmount,
      opacity: effects.focus.opacity,
      showBorder: true,
    },
  });
}

function forkBorderPreset(
  settings: FrameAnnotationStyleSettings,
  preset: BorderPreset,
  apply: (patch: Partial<FrameAnnotationStyleSettings>) => void
) {
  const effects = cloneBorderPresetEffects(preset.effects);
  apply({
    borderSettings: applyManualBorderStylePatch(projectBorderPresetToAppliedSettings(preset), {}),
    blurSettings: { ...settings.blurSettings, ...effects.blur, showBorder: true },
    focusSettings: {
      ...settings.focusSettings,
      blurAmount: effects.focus.blurAmount,
      opacity: effects.focus.opacity,
      showBorder: true,
    },
  });
}

async function saveBorderPreset(
  input: { name?: string; overwrite?: BorderPreset; tagIds?: readonly string[] },
  settings: FrameAnnotationStyleSettings,
  setSaving: (value: boolean) => void,
  setCatalog: (settings: HighlighterSettings) => void,
  setVisiblePresetIds: Dispatch<SetStateAction<string[]>>,
  selectPreset: (preset: BorderPreset) => void
) {
  setSaving(true);
  try {
    const id = input.overwrite?.id ?? crypto.randomUUID();
    const effects = cloneBorderPresetEffects(settings.borderSettings.effects);
    const preset: BorderPreset = {
      ...settings.borderSettings,
      effects: {
        ...effects,
        blur: {
          amount: settings.blurSettings.amount,
          blurType: settings.blurSettings.blurType,
        },
        focus: {
          blurAmount: settings.focusSettings.blurAmount ?? 0,
          opacity: settings.focusSettings.opacity,
        },
      },
      id,
      name: input.name?.trim() || input.overwrite?.name || '',
      enabled: true,
      order: input.overwrite?.order ?? 0,
      origin: input.overwrite?.origin ?? 'user',
      tagIds: [...(input.overwrite?.tagIds ?? input.tagIds ?? [])],
    };
    const outcome = input.overwrite
      ? await updateBorderPresetWithOutcome(preset)
      : await addBorderPresetWithOutcome(preset);
    if (outcome === 'rejected') return false;
    const next = await loadHighlighterSettings();
    setCatalog(next);
    setVisiblePresetIds((current) => mergeSessionVisibleBorderPresetIds(current, next, id));
    const canonical = next.borderPresets.find((item) => item.id === id);
    if (canonical) selectPreset(canonical);
    return true;
  } finally {
    setSaving(false);
  }
}

async function refreshCatalog(
  setCatalog: (settings: HighlighterSettings) => void,
  setVisiblePresetIds: Dispatch<SetStateAction<string[]>>,
  resetVisibility: boolean
) {
  const settings = await loadHighlighterSettings();
  setCatalog(settings);
  setVisiblePresetIds((current) =>
    resetVisibility
      ? createSessionVisibleBorderPresetIds(settings)
      : mergeSessionVisibleBorderPresetIds(current, settings)
  );
}
function createCatalogFallback(settings: FrameAnnotationStyleSettings): HighlighterSettings {
  return {
    borderPresets: [],
    defaultBlurSettings: settings.blurSettings,
    defaultBorderPresetId: settings.borderSettings.sourcePresetId ?? '',
    defaultEffectMode: settings.effectMode,
    defaultFocusSettings: settings.focusSettings,
    systemPresetCatalogRevision: 0,
    catalogCustomized: false,
  };
}
async function togglePreset(
  preset: BorderPreset,
  pending: ReadonlySet<string>,
  setPending: (value: ReadonlySet<string>) => void,
  setCatalog: (settings: HighlighterSettings) => void,
  setVisiblePresetIds: Dispatch<SetStateAction<string[]>>
) {
  if (pending.has(preset.id)) return;
  setPending(new Set([...pending, preset.id]));
  try {
    await setBorderPresetEnabled(preset.id, preset.enabled === false);
    await refreshCatalog(setCatalog, setVisiblePresetIds, false);
  } finally {
    const next = new Set(pending);
    next.delete(preset.id);
    setPending(next);
  }
}
async function saveEditedPreset(
  preset: BorderPreset,
  setSaving: (value: boolean) => void,
  setCatalog: (settings: HighlighterSettings) => void,
  setVisiblePresetIds: Dispatch<SetStateAction<string[]>>,
  selectPreset: (preset: BorderPreset) => void,
  setEditorOpen: (value: boolean) => void
) {
  setSaving(true);
  try {
    const outcome = await updateBorderPresetWithOutcome(preset);
    if (outcome === 'rejected') return;
    const settings = await loadHighlighterSettings();
    setCatalog(settings);
    setVisiblePresetIds((current) =>
      mergeSessionVisibleBorderPresetIds(current, settings, preset.id)
    );
    const canonical = settings.borderPresets.find((item) => item.id === preset.id);
    if (canonical) selectPreset(canonical);
    setEditorOpen(false);
  } finally {
    setSaving(false);
  }
}
