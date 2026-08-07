import type {
  AppliedBorderSettings,
  BorderPreset,
  BorderVisualStylePatch,
  BlurSettings,
  FocusSettings,
} from '../../../../features/highlighter/contracts';
import {
  applyManualBorderStylePatch,
  cloneBorderPresetEffects,
  projectBorderPresetToAppliedSettings,
} from '@sniptale/runtime-contracts/highlighter/border-preset';
import { useEffect, useState } from 'react';
import { setFrameSessionBorderPreset } from '../../frame-runtime/session/border-preset';
import { getBorderPresetCssValidation } from '../../../../ui/highlighter-preset-editor/useBorderPresetEditorState/validation';
import {
  createFrameBlurHandlers,
  createFrameFocusHandlers,
  createFrameSettingsPresetHandler,
} from './helpers';
import { useFrameSettingsPopoverLifecycle } from './lifecycle';
import { useFrameStyleCatalog } from './catalog';

type FrameSettingsPopoverStateArgs = {
  blurSettings?: BlurSettings;
  borderSettings?: AppliedBorderSettings;
  focusSettings?: FocusSettings;
  frameId: string;
  isOpen: boolean;
  onApplyToFrame: (settings: {
    borderSettings?: AppliedBorderSettings;
    blurSettings?: BlurSettings;
    focusSettings?: FocusSettings;
  }) => void;
  scope?: 'frame' | 'session';
};

function attachFrameEffects(
  borderSettings: AppliedBorderSettings,
  blurSettings: BlurSettings,
  focusSettings: FocusSettings
): AppliedBorderSettings {
  const effects = cloneBorderPresetEffects(borderSettings.effects);
  return {
    ...borderSettings,
    effects: {
      ...effects,
      blur: { amount: blurSettings.amount, blurType: blurSettings.blurType },
      focus: { blurAmount: focusSettings.blurAmount ?? 0, opacity: focusSettings.opacity },
    },
  };
}

function createFrameEffectControls(
  args: FrameSettingsPopoverStateArgs,
  frame: ReturnType<typeof useFrameSettingsPopoverLifecycle>['frame']
) {
  const syncSessionDefaults = (args.scope ?? 'frame') === 'session';
  const blurHandlers = createFrameBlurHandlers({
    localBlurSettings: frame.localBlurSettings,
    onApplyToFrame: args.onApplyToFrame,
    setLocalBlurSettings: frame.applyBlurSettingsFromUser,
    syncSessionDefaults,
  });
  const focusHandlers = createFrameFocusHandlers({
    ...((args.scope ?? 'frame') === 'frame' ? { frameId: args.frameId } : {}),
    localFocusSettings: frame.localFocusSettings,
    onApplyToFrame: args.onApplyToFrame,
    setLocalFocusSettings: frame.applyFocusSettingsFromUser,
    syncSessionDefaults,
  });
  const handleSelectPreset = createFrameSettingsPresetHandler({
    setLocalBlurSettings: frame.applyBlurSettingsFromUser,
    setLocalFocusSettings: frame.applyFocusSettingsFromUser,
    localBlurSettings: frame.localBlurSettings,
    localFocusSettings: frame.localFocusSettings,
    onApplyToFrame: args.onApplyToFrame,
    setSelectedPreset: frame.selectPreset,
    syncSessionDefaults,
  });
  return { blurHandlers, focusHandlers, handleSelectPreset };
}

function applyForkedFramePreset(args: {
  applyBlurSettings: (settings: BlurSettings) => void;
  applyBorderSettingsFromUser: (settings: AppliedBorderSettings) => void;
  applyFocusSettings: (settings: FocusSettings) => void;
  localBlurSettings: BlurSettings;
  localFocusSettings: FocusSettings;
  onApplyToFrame: FrameSettingsPopoverStateArgs['onApplyToFrame'];
  preset: BorderPreset;
  syncSessionDefaults: boolean;
}) {
  const effects = cloneBorderPresetEffects(args.preset.effects);
  const borderSettings = applyManualBorderStylePatch(
    projectBorderPresetToAppliedSettings(args.preset),
    {}
  );
  args.applyBorderSettingsFromUser(borderSettings);
  args.applyBlurSettings({ ...args.localBlurSettings, ...effects.blur, showBorder: true });
  args.applyFocusSettings({
    ...args.localFocusSettings,
    blurAmount: effects.focus.blurAmount,
    opacity: effects.focus.opacity,
    showBorder: true,
  });
  args.onApplyToFrame({ borderSettings });
  if (args.syncSessionDefaults) setFrameSessionBorderPreset(borderSettings);
}

function useManualFrameBorderSettings(args: {
  applyBlurSettings: (settings: BlurSettings) => void;
  applyBorderSettingsFromUser: (settings: AppliedBorderSettings) => void;
  applyFocusSettings: (settings: FocusSettings) => void;
  isOpen: boolean;
  localBorderSettings: AppliedBorderSettings;
  localBlurSettings: BlurSettings;
  localFocusSettings: FocusSettings;
  onApplyToFrame: (settings: { borderSettings: AppliedBorderSettings }) => void;
  savePreset: (input: {
    name?: string;
    overwrite?: BorderPreset;
    style: AppliedBorderSettings;
  }) => Promise<BorderPreset | null>;
  selectPreset: (preset: BorderPreset) => void;
  syncSessionDefaults: boolean;
}) {
  const [cssDraft, setCssDraft] = useState(args.localBorderSettings.customCss);

  useEffect(() => {
    if (args.isOpen) setCssDraft(args.localBorderSettings.customCss);
  }, [args.isOpen, args.localBorderSettings.customCss]);

  const applyPatch = (patch: BorderVisualStylePatch) => {
    const settings = applyManualBorderStylePatch(args.localBorderSettings, patch);
    args.applyBorderSettingsFromUser(settings);
    args.onApplyToFrame({ borderSettings: settings });
    if (args.syncSessionDefaults) setFrameSessionBorderPreset(settings);
    if (patch.effects !== undefined) {
      const effects = cloneBorderPresetEffects(patch.effects);
      args.applyBlurSettings({ ...args.localBlurSettings, ...effects.blur, showBorder: true });
      args.applyFocusSettings({
        ...args.localFocusSettings,
        blurAmount: effects.focus.blurAmount,
        opacity: effects.focus.opacity,
        showBorder: true,
      });
    }
  };
  const onCssDraftChange = (customCss: string) => {
    setCssDraft(customCss);
    const validation = getBorderPresetCssValidation(customCss);
    if (validation.cssError || validation.hasBlockedProps) return;
    applyPatch({ customCss, inheritCustomCss: Boolean(customCss.trim()) });
  };
  const save = async (input: { name?: string; overwrite?: BorderPreset }) => {
    const preset = await args.savePreset({ ...input, style: args.localBorderSettings });
    if (!preset) return false;
    args.selectPreset(preset);
    return true;
  };

  return {
    applyPatch,
    cssDraft,
    cssError: getBorderPresetCssValidation(cssDraft).cssError,
    onCssDraftChange,
    save,
  };
}

function useFrameSettingsCatalog(
  args: FrameSettingsPopoverStateArgs,
  session: ReturnType<typeof useFrameSettingsPopoverLifecycle>,
  handleSelectPreset: (preset: BorderPreset) => void
) {
  return useFrameStyleCatalog({
    isOpen: args.isOpen,
    onCanonicalPresetSaved: (settings, presetId) => {
      if (presetId !== session.frame.selectedPresetId) return;
      const canonicalPreset = settings.borderPresets.find((preset) => preset.id === presetId);
      if (canonicalPreset) handleSelectPreset(canonicalPreset);
    },
    reconcileCatalogSettings: session.catalog.reconcileCatalogSettings,
  });
}

function useFrameSettingsManualState(
  args: FrameSettingsPopoverStateArgs,
  session: ReturnType<typeof useFrameSettingsPopoverLifecycle>,
  effects: ReturnType<typeof createFrameEffectControls>,
  catalog: ReturnType<typeof useFrameSettingsCatalog>
) {
  const localBorderSettings = attachFrameEffects(
    session.frame.localBorderSettings,
    session.frame.localBlurSettings,
    session.frame.localFocusSettings
  );
  const manual = useManualFrameBorderSettings({
    applyBlurSettings: effects.blurHandlers.applyBlurSettings,
    applyBorderSettingsFromUser: session.frame.applyBorderSettingsFromUser,
    applyFocusSettings: effects.focusHandlers.applyFocusSettings,
    isOpen: args.isOpen,
    localBorderSettings,
    localBlurSettings: session.frame.localBlurSettings,
    localFocusSettings: session.frame.localFocusSettings,
    onApplyToFrame: args.onApplyToFrame,
    savePreset: catalog.manual.save,
    selectPreset: effects.handleSelectPreset,
    syncSessionDefaults: (args.scope ?? 'frame') === 'session',
  });
  const handleForkPreset = (preset: BorderPreset) =>
    applyForkedFramePreset({
      applyBlurSettings: effects.blurHandlers.applyBlurSettings,
      applyBorderSettingsFromUser: session.frame.applyBorderSettingsFromUser,
      applyFocusSettings: effects.focusHandlers.applyFocusSettings,
      localBlurSettings: session.frame.localBlurSettings,
      localFocusSettings: session.frame.localFocusSettings,
      onApplyToFrame: args.onApplyToFrame,
      preset,
      syncSessionDefaults: (args.scope ?? 'frame') === 'session',
    });
  return { handleForkPreset, localBorderSettings, manual };
}

export function useFrameSettingsPopoverState(args: FrameSettingsPopoverStateArgs) {
  const session = useFrameSettingsPopoverLifecycle({
    frameId: args.frameId,
    isOpen: args.isOpen,
    historyTransaction: (args.scope ?? 'frame') === 'frame',
    ...(args.blurSettings === undefined ? {} : { blurSettings: args.blurSettings }),
    ...(args.borderSettings === undefined ? {} : { borderSettings: args.borderSettings }),
    ...(args.focusSettings === undefined ? {} : { focusSettings: args.focusSettings }),
  });
  const effects = createFrameEffectControls(args, session.frame);
  const catalog = useFrameSettingsCatalog(args, session, effects.handleSelectPreset);
  const { handleForkPreset, localBorderSettings, manual } = useFrameSettingsManualState(
    args,
    session,
    effects,
    catalog
  );

  return {
    catalog: {
      editor: catalog.editor,
      manual: {
        cssDraft: manual.cssDraft,
        cssError: manual.cssError,
        isSaving: catalog.manual.isSaving,
        onCssDraftChange: manual.onCssDraftChange,
        save: manual.save,
      },
      pendingPresetIds: catalog.pendingPresetIds,
      refreshPresets: catalog.refreshPresets,
      visibleBorderPresets: session.catalog.visibleBorderPresets,
    },
    handlers: {
      handleBlurChange: effects.blurHandlers.handleBlurChange,
      handleBlurShowBorderChange: effects.blurHandlers.handleBlurShowBorderChange,
      handleBlurTypeChange: effects.blurHandlers.handleBlurTypeChange,
      handleFocusChange: effects.focusHandlers.handleFocusChange,
      handleFocusBlurChange: effects.focusHandlers.handleFocusBlurChange,
      handleFocusShowBorderChange: effects.focusHandlers.handleFocusShowBorderChange,
      handleForkPreset,
      handleManualBorderChange: manual.applyPatch,
      handleAddPreset: catalog.handlers.handleAddPreset,
      handleEditPreset: catalog.handlers.handleEditPreset,
      handleSelectPreset: effects.handleSelectPreset,
      handleTogglePresetEnabled: catalog.handlers.handleTogglePresetEnabled,
    },
    settings: {
      global: session.catalog.globalSettings,
      localBlur: session.frame.localBlurSettings,
      localBorder: localBorderSettings,
      localFocus: session.frame.localFocusSettings,
      selectedPresetId: session.frame.selectedPresetId,
    },
  };
}
