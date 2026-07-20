import type {
  ExportOptions,
  ExportPagePackage,
  ExportProgress,
  ExportResult,
} from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { PopupSendResponse } from '../helpers';
import type { emitPopupExportMessage, persistPopupExportArchive } from '../helpers';

type PopupExportRunner = {
  buildPackage: (options: ExportOptions) => Promise<ExportPagePackage>;
  cancel: () => void;
  export: (options: ExportOptions) => Promise<ExportResult>;
  onProgress: (callback: (progress: ExportProgress) => void) => void;
};

export type PopupExportState = {
  activeExportRequestId: string | null;
  isExportRunning: boolean;
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
