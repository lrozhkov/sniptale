import {
  NATIVE_APP_PROTOCOL_VERSION,
  type ExtensionRecordingChunkRequestMessage,
} from '../../../contracts/native-app';
import { listNativeTransferSessions } from './persistence/staging';
import { getNextMissingChunkIndex } from './sessions';

export async function createNativeTransferResumeRequests(
  controllerLeaseId: string
): Promise<ExtensionRecordingChunkRequestMessage[]> {
  const sessions = await listNativeTransferSessions();
  return sessions.flatMap((session) => {
    if (session.controllerLeaseId !== controllerLeaseId || session.kind !== 'recording') {
      return [];
    }
    const nextMissingChunk = getNextMissingChunkIndex(session);
    return nextMissingChunk === null
      ? []
      : [
          {
            chunkIndex: nextMissingChunk,
            controllerLeaseId,
            protocolVersion: NATIVE_APP_PROTOCOL_VERSION,
            recordingId: session.id,
            type: 'extension.recording.chunkRequest' as const,
          },
        ];
  });
}
