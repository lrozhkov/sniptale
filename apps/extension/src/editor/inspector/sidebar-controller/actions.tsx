import type {
  BrowserFrameState,
  EditorShapeSettings,
} from '../../../features/editor/document/types';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { translate } from '../../../platform/i18n';
import { addBorderPreset } from '../../../composition/persistence/highlighter';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import { useEditorController } from '../../application/controller-context';
import { useEditorStore } from '../../state/useEditorStore';
import { createBorderPresetFromShapeSettings } from './border-preset';
import { resolveToolSettingTargets } from './actions.helpers';
import { createSidebarActionResult } from './action-result';
import { useBorderPresetsState, useRecentColorsState } from './actions.state';
import { createPresetHeaderActions, useSidebarSelectionPatchActions } from './selection-actions';
import type { SidebarActionArgs } from './types';

type ShapePatchSelectionActions = {
  applyPresetPatch: (patch: {
    shape: Partial<EditorShapeSettings>;
    step: Partial<EditorToolSettings['step']>;
  }) => void;
  applyShapePatch: (patch: Partial<EditorShapeSettings>) => void;
  applyStepPatch: (patch: Partial<EditorToolSettings['step']>) => void;
};

function createBrowserFrameSyncAction(args: {
  controller: ReturnType<typeof useEditorController>;
  hasImage: boolean;
  setBrowserFrame: (updates: Partial<BrowserFrameState>) => void;
}) {
  return async (updates: Partial<BrowserFrameState>) => {
    const nextBrowserFrame = { ...useEditorStore.getState().browserFrame, ...updates };
    args.setBrowserFrame(nextBrowserFrame);
  };
}

function createShapePresetSaveAction(args: {
  appendBorderPreset: (preset: BorderPreset) => void;
  borderPresets: BorderPreset[];
  selectionPatchActions: Pick<ShapePatchSelectionActions, 'applyShapePatch'>;
  shapeSettings: EditorShapeSettings;
}) {
  return async () => {
    const preset = createBorderPresetFromShapeSettings(args.shapeSettings, args.borderPresets);

    try {
      await addBorderPreset(preset);
    } catch {
      toast.error(translate('editor.compact.saveShapePresetFailed'));
      return;
    }

    args.appendBorderPreset(preset);
    args.selectionPatchActions.applyShapePatch({ borderPresetId: preset.id });
    toast.success(translate('editor.compact.saveShapePresetSaved'));
  };
}

function useSidebarBrowserFrameActions(args: {
  controller: ReturnType<typeof useEditorController>;
  hasImage: boolean;
  setBrowserFrame: SidebarActionArgs['setBrowserFrame'];
}) {
  return {
    insertOrUpdateBrowserFrame: async () => {
      if (!args.hasImage) {
        return;
      }

      await args.controller.applyBrowserFrame(useEditorStore.getState().browserFrame);
    },
    syncBrowserFrame: createBrowserFrameSyncAction(args),
  };
}

function buildUtilityTargets(args: {
  selectionPatchActions: Pick<
    ShapePatchSelectionActions,
    'applyPresetPatch' | 'applyShapePatch' | 'applyStepPatch'
  >;
  targets: ReturnType<typeof resolveToolSettingTargets>;
}) {
  return {
    ...args.targets,
    preset: args.selectionPatchActions.applyPresetPatch,
    shape: args.selectionPatchActions.applyShapePatch,
    step: args.selectionPatchActions.applyStepPatch,
  };
}

function useSidebarToolActions(args: {
  appendBorderPreset: (preset: BorderPreset) => void;
  borderPresets: BorderPreset[];
  controller: ReturnType<typeof useEditorController>;
  shapeSettings: EditorShapeSettings;
  sidebarArgs: SidebarActionArgs;
  targets: ReturnType<typeof resolveToolSettingTargets>;
}) {
  const { selectionPatchActions, selectionSettingsEnabled } = useSidebarSelectionPatchActions({
    activeTool: args.sidebarArgs.activeTool,
    controller: args.controller,
    shapeTool: args.sidebarArgs.shapeTool,
    selection: args.sidebarArgs.selection,
    targets: args.targets,
    textSettings: args.sidebarArgs.textSettings,
    updateShapeSettings: args.sidebarArgs.updateShapeSettings,
    updateStepSettings: args.sidebarArgs.updateStepSettings,
  });
  const presetHeaderActions = createPresetHeaderActions({
    controller: args.controller,
    selectionSettingsEnabled,
    updateBlurSettings: args.sidebarArgs.updateBlurSettings,
    updateArrowSettings: args.sidebarArgs.updateArrowSettings,
    updateBrushSettings: args.sidebarArgs.updateBrushSettings,
    updateSelectionBlurSettings: args.sidebarArgs.updateSelectionBlurSettings,
    updateSelectionArrowSettings: args.sidebarArgs.updateSelectionArrowSettings,
    updateSelectionBrushSettings: args.sidebarArgs.updateSelectionBrushSettings,
    updateSelectionShapeSettings: args.sidebarArgs.updateSelectionShapeSettings,
    updateSelectionStepSettings: args.sidebarArgs.updateSelectionStepSettings,
    updateSelectionTextSettings: args.sidebarArgs.updateSelectionTextSettings,
    updateShapeSettings: args.sidebarArgs.updateShapeSettings,
    updateStepSettings: args.sidebarArgs.updateStepSettings,
    updateTextSettings: args.sidebarArgs.updateTextSettings,
  });

  return {
    saveShapeAsHighlighterPreset: createShapePresetSaveAction({
      appendBorderPreset: args.appendBorderPreset,
      borderPresets: args.borderPresets,
      selectionPatchActions,
      shapeSettings: args.shapeSettings,
    }),
    selectionPatchActions: {
      ...selectionPatchActions,
      ...presetHeaderActions,
    },
    utilityTargets: buildUtilityTargets({ selectionPatchActions, targets: args.targets }),
  };
}

export function useEditorInspectorSidebarActions(args: SidebarActionArgs, hasImage: boolean) {
  const controller = useEditorController();
  const { appendBorderPreset, borderPresets, defaultBorderPresetId } = useBorderPresetsState();
  const { recentColors, rememberRecentColor } = useRecentColorsState();
  const targets = resolveToolSettingTargets(args);
  const { saveShapeAsHighlighterPreset, selectionPatchActions, utilityTargets } =
    useSidebarToolActions({
      appendBorderPreset,
      borderPresets,
      controller,
      shapeSettings: args.shapeSettings,
      sidebarArgs: args,
      targets,
    });
  const { insertOrUpdateBrowserFrame, syncBrowserFrame } = useSidebarBrowserFrameActions({
    controller,
    hasImage,
    setBrowserFrame: args.setBrowserFrame,
  });

  return createSidebarActionResult({
    borderPresets,
    defaultBorderPresetId,
    controller,
    hasImage,
    recentColors,
    rememberRecentColor,
    saveShapeAsHighlighterPreset,
    selectionPatchActions,
    sidebarArgs: args,
    insertOrUpdateBrowserFrame,
    syncBrowserFrame,
    utilityTargets,
  });
}
