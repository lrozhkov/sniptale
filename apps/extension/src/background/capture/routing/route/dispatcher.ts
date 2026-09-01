import { createCaptureRouteContext } from './context';
import { routeQuickActionMessage } from './quick-action-adapter';
import { routeScreenshotCaptureMessage } from './screenshot-adapter';
import type {
  CaptureRouteCommandArgs,
  CaptureRouteCommandContext,
  RouteCaptureMessageArgs,
} from './types';
import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { routeToolbarAnnotationExportMessage } from '../../annotation-export/route';
import { handleExecuteSave, handleOpenEditorWithImage } from '../actions.download';
import { handleExportCaptureFullPage } from '../actions.export';
import { handleSaveScreenshotToGallery } from '../actions.gallery-update';
import {
  handleFetchWebSnapshotAsset,
  handleRegisterWebSnapshotAssets,
  handleWebSnapshotSaveProgress,
} from '../actions.web-snapshot';
import { handleStagePagePackageJobChunk } from '../../page-package/job/stage-route';

export function routeCaptureMessage(routeArgs: RouteCaptureMessageArgs): boolean {
  const commandArgs = normalizeCaptureRouteCommand(routeArgs);
  const commandContext: CaptureRouteCommandContext = {
    context: createCaptureRouteContext(commandArgs),
    routeArgs: commandArgs,
  };
  const { message, resolvedTabId, sendResponse } = commandArgs;

  switch (message.type) {
    case CaptureMessageType.CAPTURE_VISIBLE:
    case CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP:
    case CaptureMessageType.CAPTURE_FULL:
    case CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION:
      return routeScreenshotCaptureMessage(commandContext);
    case MessageType.TRIGGER_QUICK_ACTION:
    case MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE:
    case MessageType.TRIGGER_SCREENSHOT_CAPTURE:
      return routeQuickActionMessage(commandContext);
    case MessageType.DOWNLOAD_BROWSER_ANNOTATIONS:
    case MessageType.OPEN_EXPORT_MODAL:
      return routeToolbarAnnotationExportMessage({ message, resolvedTabId, sendResponse });
    case MessageType.EXECUTE_SAVE:
      return handleExecuteSave(message, resolvedTabId, sendResponse);
    case MessageType.OPEN_EDITOR_WITH_IMAGE:
      return handleOpenEditorWithImage(
        message,
        resolvedTabId,
        sendResponse,
        commandArgs.contentPreauthorization
      );
    case MessageType.EXPORT_CAPTURE_FULL_PAGE:
      return handleExportCaptureFullPage(
        message,
        resolvedTabId,
        sendResponse,
        commandArgs.pageAccessPort,
        commandArgs.contentPreauthorization
      );
    case MessageType.SAVE_SCREENSHOT_TO_GALLERY:
      return handleSaveScreenshotToGallery(
        message,
        resolvedTabId,
        sendResponse,
        commandArgs.contentPreauthorization
      );
    case MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK:
      return handleStagePagePackageJobChunk(message, resolvedTabId, sendResponse);
    case MessageType.REGISTER_WEB_SNAPSHOT_ASSETS:
      return handleRegisterWebSnapshotAssets(message, resolvedTabId, sendResponse);
    case MessageType.FETCH_WEB_SNAPSHOT_ASSET:
      return handleFetchWebSnapshotAsset(message, resolvedTabId, sendResponse);
    case MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED:
      return handleWebSnapshotSaveProgress(message, resolvedTabId, sendResponse);
    default: {
      void (message satisfies never);
      return false;
    }
  }
}

function normalizeCaptureRouteCommand(args: RouteCaptureMessageArgs): CaptureRouteCommandArgs {
  if (args.message.type !== MessageType.EXECUTE_SAVE) {
    return { ...args, message: args.message };
  }
  return {
    ...args,
    message: {
      ...args.message,
      actionType: args.message.actionType ?? 'download_default',
    },
  };
}
