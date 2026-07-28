import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';

export type RecordingSourceBinding = {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
};

type OffscreenRecordingStopAcknowledgement = {
  terminalError: string | null;
};

export async function requestBoundOffscreenRecordingStop(
  binding: RecordingSourceBinding,
  discard: boolean,
  transport: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'> = getBackgroundRuntimeMessaging()
): Promise<OffscreenRecordingStopAcknowledgement> {
  const response = await transport.sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
      discard,
      recordingId: binding.recordingId,
      generation: binding.generation,
      streamInstanceId: binding.streamInstanceId,
    })
  );
  if (response?.success !== true) {
    throw new Error(response?.error ?? 'Offscreen recording stop acknowledgement missing');
  }
  return {
    terminalError:
      response.result === 'terminal-failure'
        ? (response.error ?? 'The recording stopped after a terminal recorder failure')
        : null,
  };
}

export class RecordingStartCleanupFailure extends AggregateError {
  readonly retainAuthority = true;
  readonly primaryError: unknown;
  readonly cleanupError: unknown;

  constructor(primaryError: unknown, cleanupError: unknown) {
    super(
      [primaryError, cleanupError],
      'Recording start failed and identity-bound offscreen cleanup was not acknowledged'
    );
    this.primaryError = primaryError;
    this.cleanupError = cleanupError;
  }
}

export function requiresRecordingAuthorityRetention(error: unknown): boolean {
  return error instanceof RecordingStartCleanupFailure && error.retainAuthority;
}
