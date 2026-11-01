import {
  NATIVE_APP_PROTOCOL_VERSION,
  type ExtensionRecordingChunkRequestMessage,
  type ExtensionRecordingAckMessage,
} from '../../../contracts/native-app';
import { listNativeTransferSessions } from './persistence/staging';
import { getNextMissingChunkIndex } from './sessions';
import { recoverNativeVideoReceipt } from './recording';
import type { NativeAppIngestionControllerDeps } from './ingestion-types';

export async function createNativeTransferResumeRequests(
  controllerLeaseId: string,
  deps: NativeAppIngestionControllerDeps = { getCurrentControllerLeaseId: () => controllerLeaseId }
): Promise<(ExtensionRecordingChunkRequestMessage | ExtensionRecordingAckMessage)[]> {
  const sessions = await listNativeTransferSessions();
  const responses: (ExtensionRecordingChunkRequestMessage | ExtensionRecordingAckMessage)[] = [];
  for (const session of sessions) {
    if (session.controllerLeaseId === controllerLeaseId && session.kind === 'recording-complete') {
      const recovered = await recoverNativeVideoReceipt(deps, {
        recordingId: session.id,
        controllerLeaseId,
        protocolVersion: 2,
      });
      responses.push(
        ...recovered.filter(
          (message): message is ExtensionRecordingAckMessage =>
            message.type === 'extension.recording.ack'
        )
      );
      continue;
    }
    if (session.controllerLeaseId !== controllerLeaseId || session.kind !== 'recording') {
      continue;
    }
    const nextMissingChunk = getNextMissingChunkIndex(session);
    if (nextMissingChunk !== null)
      responses.push({
        chunkIndex: nextMissingChunk,
        controllerLeaseId,
        protocolVersion: NATIVE_APP_PROTOCOL_VERSION,
        recordingId: session.id,
        type: 'extension.recording.chunkRequest',
      });
  }
  return responses;
}
