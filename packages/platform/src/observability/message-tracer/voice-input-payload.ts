import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const VOICE_INPUT_TRACE_FAILURE_CODE = 'voice-input-runtime-failure';

export function isVoiceInputTraceMessageType(messageType: string): boolean {
  return (
    messageType === MessageType.OFFSCREEN_VOICE_INPUT_STATUS ||
    messageType === MessageType.OFFSCREEN_VOICE_INPUT_START ||
    messageType === MessageType.OFFSCREEN_VOICE_INPUT_STOP ||
    messageType === MessageType.OFFSCREEN_VOICE_INPUT_EVENT
  );
}

export function sanitizeVoiceInputTracePayload(messageType: string, payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }
  if (
    isVoiceInputTraceMessageType(messageType) &&
    payload['success'] === false &&
    typeof payload['error'] === 'string'
  ) {
    return { ...payload, error: VOICE_INPUT_TRACE_FAILURE_CODE };
  }
  if (messageType === MessageType.OFFSCREEN_VOICE_INPUT_START) {
    const preferences = payload['preferences'];
    if (!isRecord(preferences)) return payload;
    const { microphoneDeviceId, ...safePreferences } = preferences;
    return {
      ...payload,
      preferences: {
        ...safePreferences,
        microphoneSelected: typeof microphoneDeviceId === 'string' && microphoneDeviceId.length > 0,
      },
    };
  }
  if (messageType !== MessageType.OFFSCREEN_VOICE_INPUT_EVENT) return payload;
  const event = payload['event'];
  if (
    !isRecord(event) ||
    event['type'] !== VoiceInputPortMessageType.TRANSCRIPT ||
    typeof event['text'] !== 'string'
  ) {
    return payload;
  }
  const { text, ...safeEvent } = event;
  return {
    ...payload,
    event: {
      ...safeEvent,
      charCount: text.length,
    },
  };
}
