import type {
  ExportOptions,
  ExportPagePackage,
  ExportProgress,
  ExportResult,
} from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { ContentPrivilegedActionIntentSource } from '../../../platform/privileged-action-intent/client';
import type { persistPopupExportArchive } from '../helpers/archive/persist';
import type { emitPopupExportMessage, PopupSendResponse } from '../helpers/messaging';

export type PopupExportRunner = {
  buildPackage: (
    options: ExportOptions,
    context?: { contentIntentSource?: ContentPrivilegedActionIntentSource | undefined }
  ) => Promise<ExportPagePackage>;
  cancel: () => void;
  export: (
    options: ExportOptions,
    context?: { contentIntentSource?: ContentPrivilegedActionIntentSource | undefined }
  ) => Promise<ExportResult>;
  onProgress: (callback: (progress: ExportProgress) => void) => void;
};

export type PopupExportState = {
  activeExportRequestId: string | null;
  isExportRunning: boolean;
};

export type PopupExportRequestHandlerRuntime = {
  emitMessage: typeof emitPopupExportMessage;
  exportRunner: PopupExportRunner;
  parseTree: (contextLabel: string) => Promise<ParsedDOMTree>;
  persistArchive: typeof persistPopupExportArchive;
  state: PopupExportState;
};

export interface PopupExportControllerDeps {
  emitMessage?: typeof emitPopupExportMessage;
  exportRunner?: PopupExportRunner;
  parseTree?: (contextLabel: string) => Promise<ParsedDOMTree>;
  persistArchive?: typeof persistPopupExportArchive;
}

export interface PopupExportController {
  dispose: () => void;
  handleRequest: (request: unknown, sendResponse: PopupSendResponse) => boolean;
}
