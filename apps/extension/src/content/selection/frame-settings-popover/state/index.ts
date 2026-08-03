import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
} from '../../../../features/highlighter/contracts';
import {
  createFrameBlurHandlers,
  createFrameFocusHandlers,
  createFrameSettingsPresetHandler,
} from './helpers';
import { useFrameSettingsPopoverLifecycle } from './lifecycle';
import { useFrameStyleCatalog } from './catalog';

type FrameSettingsPopoverStateArgs = {
  blurSettings?: BlurSettings;
  borderSettings?: BorderPreset;
  focusSettings?: FocusSettings;
  frameId: string;
  isOpen: boolean;
  onApplyToFrame: (settings: {
    borderSettings?: BorderPreset;
    blurSettings?: BlurSettings;
    focusSettings?: FocusSettings;
  }) => void;
  scope?: 'frame' | 'session';
};

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
    setSelectedPresetId: session.frame.selectPreset,
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

  return {
    catalog: {
      editor: catalog.editor,
      pendingPresetIds: catalog.pendingPresetIds,
      visibleBorderPresets: session.catalog.visibleBorderPresets,
    },
    handlers: {
      handleBlurChange: blurHandlers.handleBlurChange,
      handleBlurShowBorderChange: blurHandlers.handleBlurShowBorderChange,
      handleBlurTypeChange: blurHandlers.handleBlurTypeChange,
      handleFocusChange: focusHandlers.handleFocusChange,
      handleFocusShowBorderChange: focusHandlers.handleFocusShowBorderChange,
      handleAddPreset: catalog.handlers.handleAddPreset,
      handleEditPreset: catalog.handlers.handleEditPreset,
      handleSelectPreset,
      handleTogglePresetEnabled: catalog.handlers.handleTogglePresetEnabled,
    },
    settings: {
      global: session.catalog.globalSettings,
      localBlur: session.frame.localBlurSettings,
      localFocus: session.frame.localFocusSettings,
      selectedPresetId: session.frame.selectedPresetId,
    },
  };
}
