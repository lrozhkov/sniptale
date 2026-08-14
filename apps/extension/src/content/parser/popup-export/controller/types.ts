import type { ExportOptions, ExportPagePackage } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { ContentPrivilegedActionIntentSource } from '../../../platform/privileged-action-intent/client';
import type { FullPageExportCaptureIdentity } from '../../../../contracts/full-page-capture';
import type { PopupSendResponse } from '../helpers/messaging';

export type PopupExportRunner = {
  buildPackage: (
    options: ExportOptions,
    context?: {
      contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
      fullPageCaptureIdentity?: FullPageExportCaptureIdentity | undefined;
    }
  ) => Promise<ExportPagePackage>;
  cancel: () => void;
};

export type PopupExportState = {
  activeAbortController?: AbortController | null;
  activeExportRequestId: string | null;
  isExportRunning: boolean;
};

export type PopupExportRequestHandlerRuntime = {
  exportRunner: PopupExportRunner;
  parseTree: (contextLabel: string) => Promise<ParsedDOMTree>;
  state: PopupExportState;
};

export interface PopupExportControllerDeps {
  exportRunner?: PopupExportRunner;
  parseTree?: (contextLabel: string) => Promise<ParsedDOMTree>;
}

export interface PopupExportController {
  dispose: () => void;
  handleRequest: (request: unknown, sendResponse: PopupSendResponse) => boolean;
}
