import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';
import { sanitizeVoiceInputTracePayload } from './voice-input-payload';

describe('sanitizeVoiceInputTracePayload', () => {
  it('normalizes failure response text for every voice input runtime message', () => {
    const messageTypes = [
      MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
      MessageType.OFFSCREEN_VOICE_INPUT_START,
      MessageType.OFFSCREEN_VOICE_INPUT_STOP,
      MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    ];

    for (const messageType of messageTypes) {
      expect(
        sanitizeVoiceInputTracePayload(messageType, {
          error: 'recognized private phrase from device-secret-id',
          success: false,
        })
      ).toEqual({ error: 'voice-input-runtime-failure', success: false });
    }
  });

  it('replaces a selected microphone id with a boolean diagnostic', () => {
    const sanitized = sanitizeVoiceInputTracePayload(MessageType.OFFSCREEN_VOICE_INPUT_START, {
      preferences: {
        language: 'ru-RU',
        microphoneDeviceId: 'private-device-id',
        mode: 'local-first',
      },
    });
    expect(sanitized).toEqual({
      preferences: {
        language: 'ru-RU',
        microphoneSelected: true,
        mode: 'local-first',
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain('private-device-id');
  });

  it('replaces transcript text with non-sensitive diagnostics', () => {
    const sanitized = sanitizeVoiceInputTracePayload(MessageType.OFFSCREEN_VOICE_INPUT_EVENT, {
      event: {
        confidence: 0.8,
        isFinal: false,
        sequence: 2,
        sessionId: 'session-1',
        text: 'секретный текст',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      },
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    });

    expect(sanitized).toEqual({
      event: {
        charCount: 15,
        confidence: 0.8,
        isFinal: false,
        sequence: 2,
        sessionId: 'session-1',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      },
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    });
    expect(JSON.stringify(sanitized)).not.toContain('секретный');
  });
});
