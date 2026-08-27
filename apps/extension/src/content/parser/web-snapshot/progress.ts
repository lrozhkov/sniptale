import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeRequestByType } from '../../../contracts/messaging/contracts/runtime-message';
import { getContentRuntimeServices } from '../../platform/runtime-services/services';

export type WebSnapshotSaveProgressUpdate = Omit<
  RuntimeRequestByType[typeof MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED],
  'requestId' | 'type'
>;

export function publishWebSnapshotSaveProgress(
  requestId: string,
  update: WebSnapshotSaveProgressUpdate
): void {
  void getContentRuntimeServices()
    .messaging.sendRuntimeMessage({
      ...update,
      requestId,
      type: MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED,
    })
    .catch(() => undefined);
}
