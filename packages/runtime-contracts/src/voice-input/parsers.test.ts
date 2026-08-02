import { describe, expect, it } from 'vitest';
import { MessageType } from '../messaging/message-types/index';
import {
  parseOffscreenVoiceInputRuntimeMessage,
  parseVoiceInputPortRequest,
  parseVoiceInputServerEvent,
  parseVoiceInputSnapshot,
} from './parsers';
import { VoiceInputPortMessageType } from './types';

const snapshot = {
  apiFlavor: 'standard',
  busyOwner: null,
  effectiveMode: 'local',
  errorCode: null,
  fallbackReason: null,
  language: 'ru-RU',
  localAvailability: 'available',
  phase: 'listening',
  quality: 'dictation',
  qualitySupported: true,
  requestedMode: 'local-first',
  sessionId: 'session-1',
};

describe('voice input boundary parsers', () => {
  it('accepts the fixed languages, modes, and dictation quality', () => {
    expect(parseVoiceInputSnapshot(snapshot)).toEqual(snapshot);
    expect(
      parseVoiceInputPortRequest({
        preferences: {
          language: 'en-US',
          microphoneDeviceId: 'microphone-2',
          mode: 'browser-managed',
        },
        requestId: 'request-1',
        sessionId: 'session-1',
        type: VoiceInputPortMessageType.START,
      })
    ).not.toBeNull();
  });

  it('normalizes legacy preferences and bounds selected device identifiers', () => {
    expect(
      parseVoiceInputPortRequest({
        preferences: { language: 'ru-RU', mode: 'local-first' },
        requestId: 'legacy-request',
        sessionId: 'legacy-session',
        type: VoiceInputPortMessageType.START,
      })
    ).toMatchObject({ preferences: { microphoneDeviceId: null } });
    expect(
      parseVoiceInputPortRequest({
        preferences: {
          language: 'ru-RU',
          microphoneDeviceId: 'x'.repeat(513),
          mode: 'local-first',
        },
        requestId: 'request-1',
        sessionId: 'session-1',
        type: VoiceInputPortMessageType.START,
      })
    ).toBeNull();
  });

  it('rejects extra fields, unsupported languages, and non-dictation commands', () => {
    expect(parseVoiceInputSnapshot({ ...snapshot, rawError: 'secret' })).toBeNull();
    expect(
      parseVoiceInputPortRequest({
        preferences: { language: 'fr-FR', mode: 'local-first' },
        requestId: 'request-1',
        sessionId: 'session-1',
        type: VoiceInputPortMessageType.START,
      })
    ).toBeNull();
    expect(
      parseOffscreenVoiceInputRuntimeMessage({
        capabilityToken: 'capability',
        preferences: { language: 'ru-RU', mode: 'local-first' },
        quality: 'command',
        requestId: 'request-1',
        sessionId: 'session-1',
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      })
    ).toBeNull();
  });

  it('parses transcript events without accepting a raw error field', () => {
    const event = {
      confidence: 0.5,
      isFinal: false,
      sequence: 1,
      sessionId: 'session-1',
      text: 'текст',
      type: VoiceInputPortMessageType.TRANSCRIPT,
    };
    expect(parseVoiceInputServerEvent(event)).toEqual(event);
    expect(parseVoiceInputServerEvent({ ...event, rawError: 'secret' })).toBeNull();
    expect(parseVoiceInputServerEvent({ ...event, text: 'x'.repeat(16_001) })).toBeNull();
    expect(parseVoiceInputServerEvent({ ...event, confidence: 2 })).toBeNull();
    expect(
      parseVoiceInputServerEvent({
        level: 0.42,
        peaks: Array.from({ length: 16 }, (_, index) => index / 16),
        sessionId: 'session-1',
        type: VoiceInputPortMessageType.AUDIO_LEVEL,
      })
    ).not.toBeNull();
    expect(
      parseVoiceInputServerEvent({
        level: 2,
        peaks: Array.from({ length: 16 }, () => 0.2),
        sessionId: 'session-1',
        type: VoiceInputPortMessageType.AUDIO_LEVEL,
      })
    ).toBeNull();
    expect(
      parseVoiceInputServerEvent({
        level: 0.4,
        peaks: [0.2],
        sessionId: 'session-1',
        type: VoiceInputPortMessageType.AUDIO_LEVEL,
      })
    ).toBeNull();
  });
});
