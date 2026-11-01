import { isCurrentLease } from './lease';
import type { NativeHistoryInboundMessage } from '../../../contracts/native-app/attachment-message-types';
import { createNativeRecordingHistoryIngestion } from './history-ingestion';
import { createNativeRecordingHistoryStore } from '../../../composition/persistence/recordings/native-history/store';
import type {
  AppRecordingChunkMessage,
  AppRecordingStartedMessage,
  AppRecordingStoppedMessage,
  AppScreenshotChunkMessage,
  AppScreenshotCommitMessage,
  AppScreenshotStartMessage,
} from '../../../contracts/native-app';
import type {
  NativeAppIngestionControllerDeps,
  NativeIngestionOutboundMessage,
} from './ingestion-types';
import {
  handleNativeRecordingChunk,
  handleNativeRecordingStarted,
  handleNativeRecordingStopped,
  recoverNativeVideoReceipt,
} from './recording';
import { createNativeTransferResumeRequests } from './resume';
import {
  handleNativeScreenshotChunk,
  handleNativeScreenshotCommit,
  handleNativeScreenshotStart,
} from './screenshot';
import { createNativeTransferQueue } from './transfer-queue';
import { acquireNativeIngestionPermit } from './lifecycle-gate';

export interface NativeAppIngestionController {
  handleHistory(message: NativeHistoryInboundMessage): Promise<NativeIngestionOutboundMessage[]>;
  resumePendingHistoryTransfers(
    controllerLeaseId: string,
    includePublished?: boolean
  ): Promise<NativeIngestionOutboundMessage[]>;
  handleRecordingChunk(
    message: AppRecordingChunkMessage
  ): Promise<NativeIngestionOutboundMessage[]>;
  handleRecordingStarted(
    message: AppRecordingStartedMessage
  ): Promise<NativeIngestionOutboundMessage[]>;
  handleRecordingStopped(
    message: AppRecordingStoppedMessage
  ): Promise<NativeIngestionOutboundMessage[]>;
  handleScreenshotChunk(
    message: AppScreenshotChunkMessage
  ): Promise<NativeIngestionOutboundMessage[]>;
  handleScreenshotCommit(
    message: AppScreenshotCommitMessage
  ): Promise<NativeIngestionOutboundMessage[]>;
  handleScreenshotStart(
    message: AppScreenshotStartMessage
  ): Promise<NativeIngestionOutboundMessage[]>;
  resumePendingTransfers(controllerLeaseId: string): Promise<NativeIngestionOutboundMessage[]>;
}

export function createNativeAppIngestionController(
  deps: NativeAppIngestionControllerDeps = {}
): NativeAppIngestionController {
  const queue = createNativeTransferQueue();
  const history = createNativeRecordingHistoryIngestion({
    currentLeaseId: () => deps.getCurrentControllerLeaseId?.() ?? null,
    enabled: (kind) => deps.isHistoryEnabled?.(kind) === true,
  });

  function runAdmitted(
    key: string,
    task: () => Promise<NativeIngestionOutboundMessage[]>
  ): Promise<NativeIngestionOutboundMessage[]> {
    const release = acquireNativeIngestionPermit();
    if (!release) return Promise.resolve([]);
    return queue.run(key, task).finally(release);
  }

  return {
    handleHistory(message) {
      return runAdmitted(message.recordingId, async () => {
        const responses: NativeIngestionOutboundMessage[] = await history.handle(message);
        if (
          responses.some(
            (response) =>
              response.type === 'extension.recording.attachment.ack' ||
              response.type === 'extension.recording.events.ack'
          )
        )
          responses.push(...(await recoverNativeVideoReceipt(deps, message)));
        return isCurrentLease(deps, message.controllerLeaseId) ? responses : [];
      });
    },
    async resumePendingHistoryTransfers(controllerLeaseId, includePublished = false) {
      if (!deps.isHistoryEnabled?.('cursor') && !deps.isHistoryEnabled?.('events')) return [];
      const messages: NativeIngestionOutboundMessage[] = [];
      for await (const recordingId of createNativeRecordingHistoryStore().candidates(
        controllerLeaseId,
        includePublished
      )) {
        messages.push(
          ...(await runAdmitted(recordingId, async () => {
            const receipts = await recoverNativeVideoReceipt(deps, {
              recordingId,
              controllerLeaseId,
              protocolVersion: 2,
            });
            try {
              receipts.push(
                ...(await history.resume(recordingId, controllerLeaseId, includePublished))
              );
            } catch {
              /* Preserve the independent video receipt after a history failure. */
            }
            return receipts;
          }))
        );
      }
      return messages;
    },
    handleScreenshotStart(message) {
      return runAdmitted(message.captureId, () => handleNativeScreenshotStart(deps, message));
    },
    handleScreenshotChunk(message) {
      return runAdmitted(message.captureId, () => handleNativeScreenshotChunk(deps, message));
    },
    handleScreenshotCommit(message) {
      return runAdmitted(message.captureId, () => handleNativeScreenshotCommit(deps, message));
    },
    handleRecordingStopped(message) {
      return runAdmitted(message.recordingId, () => handleNativeRecordingStopped(deps, message));
    },
    handleRecordingStarted(message) {
      return runAdmitted(message.recordingId, () => handleNativeRecordingStarted(deps, message));
    },
    handleRecordingChunk(message) {
      return runAdmitted(message.recordingId, async () => {
        const responses = await handleNativeRecordingChunk(deps, message);
        if (
          (deps.isHistoryEnabled?.('cursor') || deps.isHistoryEnabled?.('events')) &&
          responses.some((response) => response.type === 'extension.recording.ack')
        ) {
          try {
            responses.push(
              ...(await history.resume(message.recordingId, message.controllerLeaseId))
            );
          } catch {
            /* Video receipt remains independent from optional histories. */
          }
        }
        return responses;
      });
    },
    resumePendingTransfers(controllerLeaseId) {
      return runAdmitted(controllerLeaseId, () =>
        createNativeTransferResumeRequests(controllerLeaseId, deps)
      );
    },
  };
}
