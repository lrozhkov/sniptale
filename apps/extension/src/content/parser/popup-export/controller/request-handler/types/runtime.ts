import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentPrivilegedActionIntentSource } from '../../../../../platform/privileged-action-intent/client';
import type {
  ExportPagePackage,
  ExportOptions,
  ExportProgress,
  ExportResult,
  PopupExportResult,
} from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { PopupExportState } from '../../types';

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

type PopupExportEmitMessage = (
  message:
    | {
        type: MessageType.EXPORT_POPUP_PROGRESS;
        progress: ExportProgress;
        requestId: string;
      }
    | {
        type: MessageType.EXPORT_POPUP_RESULT;
        requestId: string;
        result: PopupExportResult;
      }
) => Promise<void>;

type PopupExportParseTree = (contextLabel: string) => Promise<ParsedDOMTree>;

type PopupExportPersistArchive = (result: ExportResult) => Promise<string[]>;

export type PopupExportRequestHandlerRuntime = {
  emitMessage: PopupExportEmitMessage;
  exportRunner: PopupExportRunner;
  parseTree: PopupExportParseTree;
  persistArchive: PopupExportPersistArchive;
  state: PopupExportState;
};
