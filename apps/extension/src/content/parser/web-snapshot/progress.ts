import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeRequestByType } from '../../../contracts/messaging/contracts/runtime-message';
import { getContentRuntimeServices } from '../../platform/runtime-services/services';

export type WebSnapshotSaveProgressUpdate = Omit<
  RuntimeRequestByType[typeof MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED],
  'requestId' | 'type'
>;

type PublishedProgressState = {
  activeStepKey: WebSnapshotSaveProgressUpdate['activeStepKey'];
  completed: boolean;
};

const publishedProgressByRequest = new Map<string, PublishedProgressState>();
const publicationQueueByRequest = new Map<string, Promise<void>>();

function shouldPublishProgress(requestId: string, update: WebSnapshotSaveProgressUpdate): boolean {
  const completed = update.current >= update.total;
  const previous = publishedProgressByRequest.get(requestId);
  if (previous?.activeStepKey === update.activeStepKey) {
    if (previous.completed || !completed) return false;
  }
  publishedProgressByRequest.set(requestId, {
    activeStepKey: update.activeStepKey,
    completed,
  });
  return true;
}

export function publishWebSnapshotSaveProgress(
  requestId: string,
  update: WebSnapshotSaveProgressUpdate
): void {
  if (!shouldPublishProgress(requestId, update)) return;
  const publish = () =>
    getContentRuntimeServices().messaging.sendRuntimeMessage({
      ...update,
      requestId,
      type: MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED,
    });
  const previous = publicationQueueByRequest.get(requestId);
  const publication = (previous ? previous.then(publish, publish) : publish()).then(
    () => undefined,
    () => undefined
  );
  publicationQueueByRequest.set(requestId, publication);
  void publication.finally(() => {
    if (publicationQueueByRequest.get(requestId) === publication) {
      publicationQueueByRequest.delete(requestId);
    }
  });
}

export function clearWebSnapshotSaveProgress(requestId: string): void {
  publishedProgressByRequest.delete(requestId);
}
