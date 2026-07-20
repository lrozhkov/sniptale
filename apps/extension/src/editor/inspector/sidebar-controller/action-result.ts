import { translate } from '../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { ImageEditorController } from '../../controller';
import type { EditorRenderedImageOptions } from '../../document/model/render-options';
import {
  buildBorderPresetOptions,
  buildSidebarUtilityActions,
  createStaticSidebarOptions,
} from './actions.helpers';
import type { SidebarActionArgs, SidebarUtilityActionArgs } from './types';
import {
  createWorkspaceColorActionForSidebar,
  createWorkspaceDefaultSaveActionForSidebar,
} from './workspace-color-action';

type BrowserFrameInsertAction = {
  insertOrUpdateBrowserFrame?: NonNullable<SidebarUtilityActionArgs['insertOrUpdateBrowserFrame']>;
};

function createBrowserFrameInsertAction(
  insertOrUpdateBrowserFrame: SidebarUtilityActionArgs['insertOrUpdateBrowserFrame']
): BrowserFrameInsertAction {
  return insertOrUpdateBrowserFrame === undefined ? {} : { insertOrUpdateBrowserFrame };
}

function buildSidebarActionUtilityActions(args: {
  browserFrameInsertAction: BrowserFrameInsertAction;
  resultArgs: {
    borderPresets: SidebarUtilityActionArgs['borderPresets'];
    controller: ImageEditorController;
    hasImage: boolean;
    rememberRecentColor: SidebarUtilityActionArgs['rememberRecentColor'];
    sidebarArgs: SidebarActionArgs;
    syncBrowserFrame: SidebarUtilityActionArgs['syncBrowserFrame'];
    utilityTargets: SidebarUtilityActionArgs['targets'];
  };
}) {
  const resultArgs = args.resultArgs;
  return buildSidebarUtilityActions({
    borderPresets: resultArgs.borderPresets,
    controller: resultArgs.controller,
    confirmOpenStorageManager: resultArgs.sidebarArgs.confirmOpenStorageManager,
    defaultImagePresetId: resultArgs.sidebarArgs.defaultImagePresetId,
    hasImage: resultArgs.hasImage,
    rememberRecentColor: resultArgs.rememberRecentColor,
    savePresets: resultArgs.sidebarArgs.savePresets,
    setFrameDraft: resultArgs.sidebarArgs.setFrameDraft,
    syncBrowserFrame: resultArgs.syncBrowserFrame,
    targets: resultArgs.utilityTargets,
    ...args.browserFrameInsertAction,
  });
}

export function createSidebarActionResult<TSelectionPatchActions extends object>(args: {
  borderPresets: SidebarUtilityActionArgs['borderPresets'];
  defaultBorderPresetId: string;
  controller: ImageEditorController;
  hasImage: boolean;
  recentColors: string[];
  rememberRecentColor: SidebarUtilityActionArgs['rememberRecentColor'];
  saveShapeAsHighlighterPreset: () => Promise<void>;
  selectionPatchActions: TSelectionPatchActions;
  sidebarArgs: SidebarActionArgs;
  syncBrowserFrame: SidebarUtilityActionArgs['syncBrowserFrame'];
  insertOrUpdateBrowserFrame: SidebarUtilityActionArgs['insertOrUpdateBrowserFrame'];
  utilityTargets: SidebarUtilityActionArgs['targets'];
}) {
  const browserFrameInsertAction = createBrowserFrameInsertAction(args.insertOrUpdateBrowserFrame);
  const utilityActions = buildSidebarActionUtilityActions({
    browserFrameInsertAction,
    resultArgs: args,
  });
  const result = {
    ...args.selectionPatchActions,
    copyRenderedImageDisabledReason: null,
    onApplyFrame: () => args.controller.applyFrameSettings(args.sidebarArgs.frameDraft),
    applyWorkspaceColor: createWorkspaceColorActionForSidebar(
      args.sidebarArgs,
      args.rememberRecentColor
    ),
    saveWorkspaceColorAsDefault: createWorkspaceDefaultSaveActionForSidebar(args.sidebarArgs),
    onCopyRenderedImage: (options?: EditorRenderedImageOptions) =>
      copyRenderedImageWithFeedback(args.controller, args.hasImage, options),
    ...createStaticSidebarOptions(),
    borderPresetOptions: buildBorderPresetOptions(args.borderPresets),
    borderPresets: args.borderPresets,
    defaultBorderPresetId: args.defaultBorderPresetId,
    saveShapeAsHighlighterPreset: args.saveShapeAsHighlighterPreset,
    recentColors: args.recentColors,
    ...utilityActions,
    ...browserFrameInsertAction,
  };

  return result;
}

async function copyRenderedImageWithFeedback(
  controller: ImageEditorController,
  hasImage: boolean,
  options?: EditorRenderedImageOptions
): Promise<void> {
  if (!hasImage) {
    return;
  }

  try {
    await controller.copyRenderedImage(options);
  } catch (error) {
    const message = translate('editor.runtime.copyImageFailed');
    toast.error(message);
    const wrappedError = new Error(message) as Error & { cause?: unknown };
    wrappedError.cause = error;
    throw wrappedError;
  }
}
