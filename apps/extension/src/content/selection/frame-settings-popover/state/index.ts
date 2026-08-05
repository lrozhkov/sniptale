import type {
  AppliedBorderSettings,
  BorderPreset,
  BorderVisualStylePatch,
  BlurSettings,
  FocusSettings,
} from '../../../../features/highlighter/contracts';
import { applyManualBorderStylePatch } from '@sniptale/runtime-contracts/highlighter/border-preset';
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

function useManualFrameBorderSettings(args: {
  applyBorderSettingsFromUser: (settings: AppliedBorderSettings) => void;
  isOpen: boolean;
  localBorderSettings: AppliedBorderSettings;
  onApplyToFrame: (settings: { borderSettings: AppliedBorderSettings }) => void;
  savePreset: (input: {
    name?: string;
    overwrite?: BorderPreset;
    style: AppliedBorderSettings;
  }) => Promise<BorderPreset | null>;
  selectPreset: (preset: BorderPreset) => void;
}) {
  const [cssDraft, setCssDraft] = useState(args.localBorderSettings.customCss);

  useEffect(() => {
    if (args.isOpen) setCssDraft(args.localBorderSettings.customCss);
  }, [args.isOpen, args.localBorderSettings.customCss]);

  const applyPatch = (patch: BorderVisualStylePatch) => {
    const settings = applyManualBorderStylePatch(args.localBorderSettings, patch);
    args.applyBorderSettingsFromUser(settings);
    args.onApplyToFrame({ borderSettings: settings });
    setFrameSessionBorderPreset(settings);
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

export function useFrameSettingsPopoverState(args: FrameSettingsPopoverStateArgs) {
  const session = useFrameSettingsPopoverLifecycle({
    frameId: args.frameId,
    isOpen: args.isOpen,
    historyTransaction: (args.scope ?? 'frame') === 'frame',
    ...(args.blurSettings === undefined ? {} : { blurSettings: args.blurSettings }),
    ...(args.borderSettings === undefined ? {} : { borderSettings: args.borderSettings }),
    ...(args.focusSettings === undefined ? {} : { focusSettings: args.focusSettings }),
  });
  const handleSelectPreset = createFrameSettingsPresetHandler({
    onApplyToFrame: args.onApplyToFrame,
    setSelectedPreset: session.frame.selectPreset,
  });
  const blurHandlers = createFrameBlurHandlers({
    localBlurSettings: session.frame.localBlurSettings,
    onApplyToFrame: args.onApplyToFrame,
    setLocalBlurSettings: session.frame.applyBlurSettingsFromUser,
  });
  const focusHandlers = createFrameFocusHandlers({
    ...((args.scope ?? 'frame') === 'frame' ? { frameId: args.frameId } : {}),
    localFocusSettings: session.frame.localFocusSettings,
    onApplyToFrame: args.onApplyToFrame,
    setLocalFocusSettings: session.frame.applyFocusSettingsFromUser,
  });
  const catalog = useFrameStyleCatalog({
    isOpen: args.isOpen,
    onCanonicalPresetSaved: (settings, presetId) => {
      if (presetId !== session.frame.selectedPresetId) return;
      const canonicalPreset = settings.borderPresets.find((preset) => preset.id === presetId);
      if (canonicalPreset) handleSelectPreset(canonicalPreset);
    },
    reconcileCatalogSettings: session.catalog.reconcileCatalogSettings,
  });
  const manual = useManualFrameBorderSettings({
    applyBorderSettingsFromUser: session.frame.applyBorderSettingsFromUser,
    isOpen: args.isOpen,
    localBorderSettings: session.frame.localBorderSettings,
    onApplyToFrame: args.onApplyToFrame,
    savePreset: catalog.manual.save,
    selectPreset: handleSelectPreset,
  });

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
      visibleBorderPresets: session.catalog.visibleBorderPresets,
    },
    handlers: {
      handleBlurChange: blurHandlers.handleBlurChange,
      handleBlurShowBorderChange: blurHandlers.handleBlurShowBorderChange,
      handleBlurTypeChange: blurHandlers.handleBlurTypeChange,
      handleFocusChange: focusHandlers.handleFocusChange,
      handleFocusShowBorderChange: focusHandlers.handleFocusShowBorderChange,
      handleManualBorderChange: manual.applyPatch,
      handleAddPreset: catalog.handlers.handleAddPreset,
      handleEditPreset: catalog.handlers.handleEditPreset,
      handleSelectPreset,
      handleTogglePresetEnabled: catalog.handlers.handleTogglePresetEnabled,
    },
    settings: {
      global: session.catalog.globalSettings,
      localBlur: session.frame.localBlurSettings,
      localBorder: session.frame.localBorderSettings,
      localFocus: session.frame.localFocusSettings,
      selectedPresetId: session.frame.selectedPresetId,
    },
  };
}
