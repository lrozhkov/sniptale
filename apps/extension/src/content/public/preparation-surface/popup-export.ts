import { translate } from '../../../platform/i18n';
import type { ViewerPopupExportMessage } from '../../../workflows/page-preparation';
import { parsePageSnapshotAfterIframePreflight } from '../../../content/parser/dom-tree-parser/snapshot';
import { createExportManagerService } from '../../../content/parser/export-manager/service';
import { createPopupExportController } from '../../../content/parser/popup-export';
import type { PopupExportController } from '../../../content/parser/popup-export/controller/types';
import type { PreparationPageSnapshotSource, PreparationPopupSendResponse } from './types';

export function createPreparationPopupExportController(args: {
  resolveSnapshotSource: () => PreparationPageSnapshotSource;
}): PopupExportController {
  return createPopupExportController({
    exportRunner: createExportManagerService({
      resolveSnapshotSource: args.resolveSnapshotSource,
    }),
    parseTree: (contextLabel) =>
      parsePageSnapshotAfterIframePreflight(contextLabel, args.resolveSnapshotSource()),
  });
}

export function handlePreparationPopupExportRequest(args: {
  controller: PopupExportController | null;
  request: ViewerPopupExportMessage;
  sendResponse: PreparationPopupSendResponse;
}): void {
  if (!args.controller) {
    args.sendResponse({
      success: false,
      error: translate('content.runtime.exportPrepareFailed'),
    });
    return;
  }

  if (!args.controller.handleRequest(args.request, args.sendResponse)) {
    args.sendResponse({
      success: false,
      error: translate('content.runtime.exportRequestHandlingFailed'),
    });
  }
}
