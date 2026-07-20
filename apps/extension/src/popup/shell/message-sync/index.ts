import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { parsePopupRuntimeMessage } from '../../../contracts/messaging/parsers/boundary';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';

type RecordingMessageHandlers = {
  onRecordingState: (state: VideoRecordingRuntimeState) => void;
  onRecordingStartFailed: (error?: string) => void;
};

type RecordingRuntimeMessage =
  | { type: VideoMessageType.RECORDING_STATE_SYNC; state: VideoRecordingRuntimeState }
  | { type: VideoMessageType.RECORDING_START_FAILED; error?: string };

function parseRecordingRuntimeMessage(message: unknown): RecordingRuntimeMessage | null {
  try {
    const parsedMessage = parsePopupRuntimeMessage(message);
    if (
      parsedMessage.type === VideoMessageType.RECORDING_STATE_SYNC ||
      parsedMessage.type === VideoMessageType.RECORDING_START_FAILED
    ) {
      return parsedMessage;
    }
  } catch {
    return null;
  }

  return null;
}

export function subscribeToRecordingMessages(handlers: RecordingMessageHandlers): () => void {
  const listener = (message: unknown) => {
    const typedMessage = parseRecordingRuntimeMessage(message);
    if (!typedMessage) {
      return;
    }

    if (typedMessage.type === VideoMessageType.RECORDING_STATE_SYNC && typedMessage.state) {
      handlers.onRecordingState(typedMessage.state);
      return;
    }

    if (typedMessage.type === VideoMessageType.RECORDING_START_FAILED) {
      handlers.onRecordingStartFailed(typedMessage.error);
    }
  };

  return browserRuntime.subscribeToMessages(listener);
}
