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

  function runAdmitted(
    key: string,
    task: () => Promise<NativeIngestionOutboundMessage[]>
  ): Promise<NativeIngestionOutboundMessage[]> {
    const release = acquireNativeIngestionPermit();
    if (!release) return Promise.resolve([]);
    return queue.run(key, task).finally(release);
  }

  return {
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
      return runAdmitted(message.recordingId, () => handleNativeRecordingChunk(deps, message));
    },
    resumePendingTransfers(controllerLeaseId) {
      return runAdmitted(controllerLeaseId, () =>
        createNativeTransferResumeRequests(controllerLeaseId)
      );
    },
  };
}
