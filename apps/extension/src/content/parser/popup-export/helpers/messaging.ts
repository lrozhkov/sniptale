import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../platform/runtime-services/services';
import type {
  ExportProgress,
  PopupExportPreview,
  PopupExportResult,
} from '@sniptale/runtime-contracts/export';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const logger = createLogger({ namespace: 'ContentPopupExport' });

type PopupRuntimeMessage =
  | {
      type: MessageType.EXPORT_POPUP_PROGRESS;
      progress: ExportProgress;
      requestId: string;
    }
  | {
      type: MessageType.EXPORT_POPUP_RESULT;
      requestId: string;
      result: PopupExportResult;
    };

export type PopupSendResponse = (response?: {
  assetId?: string;
  error?: string;
  manifest?: WebSnapshotManifest;
  preview?: PopupExportPreview;
  success?: boolean;
  warnings?: string[];
}) => void;

export function emitPopupExportMessage(message: PopupRuntimeMessage): Promise<void> {
  return getContentRuntimeServices()
    .messaging.sendRuntimeMessage(message)
    .then(() => undefined)
    .catch((error: unknown) => {
      logger.debug('Popup listener is not available', { error });
    });
}
