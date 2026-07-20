import { finalizeSidecarRecording } from '../finalizer';
import { getActiveSidecarSession } from './state';

export async function finalizeActiveSidecarRecordings(discard: boolean): Promise<void> {
  const session = getActiveSidecarSession();
  if (!session) {
    return;
  }

  await Promise.all(
    session.recorders.map((sidecar) =>
      finalizeSidecarRecording({
        chunks: sidecar.chunks,
        discard,
        filenameSuffix: sidecar.filenameSuffix,
        mimeType: sidecar.recorder.mimeType,
        recordingId: sidecar.recordingId,
      })
    )
  );
}
