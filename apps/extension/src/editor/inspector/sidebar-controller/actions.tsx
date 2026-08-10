import type { BrowserFrameState } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { useEditorController } from '../../application/controller-context';
import { useEditorStore } from '../../state/useEditorStore';
import type { EditorRenderedImageOptions } from '../../document/model/render-options';
import { createStaticSidebarOptions, buildSidebarUtilityActions } from './actions.helpers';
import { useBorderPresetsState, useRecentColorsState } from './actions.state';
import { useSelectionSettingsHistoryPreview } from './history-preview';
import {
  createWorkspaceColorActionForSidebar,
  createWorkspaceDefaultSaveActionForSidebar,
} from './workspace-color-action';
import type { SidebarActionArgs } from './types';

function createBrowserFrameSyncAction(args: SidebarActionArgs) {
  return async (updates: Partial<BrowserFrameState>) => {
    args.setBrowserFrame({ ...useEditorStore.getState().browserFrame, ...updates });
  };
}

export function useEditorInspectorSidebarActions(args: SidebarActionArgs, hasImage: boolean) {
  const controller = useEditorController();
  const { borderPresets, defaultBorderPresetId } = useBorderPresetsState();
  const { recentColors, rememberRecentColor } = useRecentColorsState();
  const selectionSettingsEnabled =
    args.selection.hasSelection && !args.selection.selectedObjectLocked;
  const historyPreview = useSelectionSettingsHistoryPreview({
    controller,
    selectionSettingsEnabled,
  });
  const syncBrowserFrame = createBrowserFrameSyncAction(args);

  const patchStep = (patch: Parameters<typeof args.updateStepSettings>[0]) => {
    if (args.selection.selectedObjectType === 'step') {
      args.updateSelectionStepSettings(patch);
      controller.applyActiveSettingsToSelection();
    } else {
      args.updateStepSettings(patch);
      controller.refreshActiveToolSettingsPreview();
    }
  };
  const patchImage = (patch: Parameters<typeof args.updateImageSettings>[0]) => {
    if (
      args.selection.selectedObjectType === 'image' ||
      args.selection.selectedObjectType === 'source-image' ||
      args.selection.selectedObjectType === 'background'
    ) {
      args.updateSelectionImageSettings(patch);
      controller.applyActiveSettingsToSelection();
    } else {
      args.updateImageSettings(patch);
    }
  };
  const utility = buildSidebarUtilityActions({
    controller,
    confirmOpenStorageManager: args.confirmOpenStorageManager,
    defaultImagePresetId: args.defaultImagePresetId,
    hasImage,
    rememberRecentColor,
    savePresets: args.savePresets,
    setFrameDraft: args.setFrameDraft,
    syncBrowserFrame,
  });

  const selectionActions = {
    applyImagePatch: (patch: Parameters<typeof patchImage>[0]) => {
      patchImage(patch);
      if (selectionSettingsEnabled) controller.commitHistory();
    },
    previewImagePatch: (patch: Parameters<typeof patchImage>[0]) =>
      historyPreview.previewSelectionSettings(() => patchImage(patch)),
    applyStepPatch: (patch: Parameters<typeof patchStep>[0]) => {
      patchStep(patch);
      if (selectionSettingsEnabled) controller.commitHistory();
    },
    previewStepPatch: (patch: Parameters<typeof patchStep>[0]) =>
      historyPreview.previewSelectionSettings(() => patchStep(patch)),
    commitPendingSelectionSettings: historyPreview.commitPendingSelectionSettings,
    applyTextStyle: (command: Parameters<typeof controller.applyTextSelectionStyle>[0]) => {
      controller.applyTextSelectionStyle(command);
    },
  };
  const catalogActions = {
    applyWorkspaceColor: createWorkspaceColorActionForSidebar(args, rememberRecentColor),
    saveWorkspaceColorAsDefault: createWorkspaceDefaultSaveActionForSidebar(args),
    borderPresetOptions: borderPresets
      .filter((preset) => preset.enabled !== false)
      .map((preset) => ({ label: preset.name, value: preset.id })),
    borderPresets,
    defaultBorderPresetId,
    recentColors,
  };
  const editorActions = {
    copyRenderedImageDisabledReason: null,
    onApplyFrame: () => controller.applyFrameSettings(args.frameDraft),
    onCopyRenderedImage: async (options?: EditorRenderedImageOptions) => {
      if (!hasImage) return;
      try {
        await controller.copyRenderedImage(options);
      } catch (error) {
        toast.error(translate('editor.runtime.copyImageFailed'));
        throw error;
      }
    },
    insertOrUpdateBrowserFrame: async () => {
      if (hasImage) await controller.applyBrowserFrame(useEditorStore.getState().browserFrame);
    },
    syncBrowserFrame,
  };
  return {
    catalogActions,
    editorActions,
    selectionActions,
    staticOptions: createStaticSidebarOptions(),
    utilityActions: utility,
  };
}
