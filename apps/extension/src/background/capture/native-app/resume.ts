import { listNativeTransferSessions } from './persistence/staging';
import { resumeNativeRecordingTransfer } from './recording';
import type {
  NativeAppIngestionControllerDeps,
  NativeIngestionOutboundMessage,
} from './ingestion-types';

export async function createNativeTransferResumeRequests(
  controllerLeaseId: string,
  deps: NativeAppIngestionControllerDeps = { getCurrentControllerLeaseId: () => controllerLeaseId },
  run: (
    key: string,
    task: () => Promise<NativeIngestionOutboundMessage[]>
  ) => Promise<NativeIngestionOutboundMessage[]> = (_key, task) => task()
): Promise<NativeIngestionOutboundMessage[]> {
  const sessions = await listNativeTransferSessions();
  const responses: NativeIngestionOutboundMessage[] = [];
  for (const session of sessions) {
    if (
      session.controllerLeaseId !== controllerLeaseId ||
      (session.kind !== 'recording' && session.kind !== 'recording-complete')
    ) {
      continue;
    }
    responses.push(
      ...(await run(session.id, () =>
        resumeNativeRecordingTransfer(deps, session.id, controllerLeaseId)
      ))
    );
  }
  return responses;
}
