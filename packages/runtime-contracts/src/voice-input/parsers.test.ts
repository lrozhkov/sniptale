import { VOICE_INPUT_TRANSCRIPT_MAX_CHARS } from './types';
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
    const offscreenStart = {
      capabilityToken: 'capability',
      captureToken: {
        entryId: 'entry',
        incarnation: 'incarnation',
        epoch: 'epoch',
        sequence: 1,
        createdAt: 0,
      },
      preferences: { language: 'ru-RU', mode: 'local-first' },
      quality: 'dictation',
      requestId: 'request-1',
      sessionId: 'session-1',
      type: MessageType.OFFSCREEN_VOICE_INPUT_START,
    } as const;
    expect(
      parseOffscreenVoiceInputRuntimeMessage({ ...offscreenStart, maxDurationMs: null })
    ).not.toBeNull();
    expect(
      parseOffscreenVoiceInputRuntimeMessage({ ...offscreenStart, maxDurationMs: 30_000 })
    ).not.toBeNull();
    expect(
      parseOffscreenVoiceInputRuntimeMessage({ ...offscreenStart, maxDurationMs: 30_001 })
    ).toBeNull();
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
        maxDurationMs: null,
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
    expect(
      parseVoiceInputServerEvent({
        ...event,
        text: 'x'.repeat(VOICE_INPUT_TRANSCRIPT_MAX_CHARS + 1),
      })
    ).toBeNull();
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

it('preserves legacy voice preferences and strictly admits explicit model choices', async () => {
  const { parseVoiceInputPreferences, resolveVoiceInputPreferences } = await import('./parsers');
  const legacy = {
    language: 'ru-RU' as const,
    microphoneDeviceId: null,
    mode: 'local-first' as const,
  };
  expect(parseVoiceInputPreferences(legacy)).toEqual(legacy);
  expect(resolveVoiceInputPreferences(legacy)).toMatchObject({
    backend: 'browser',
    transcription: null,
    correction: { enabled: false, model: null },
  });
  const selection = {
    modelId: 'asr',
    approvedProviderId: 'provider',
    approvedDestination: `sha256:${'a'.repeat(64)}`,
    approvedModelCode: 'whisper',
  };
  const prefs = {
    ...legacy,
    backend: 'model',
    transcription: selection,
    correction: { enabled: true, model: selection },
  };
  expect(parseVoiceInputPreferences(prefs)).toEqual(prefs);
  expect(
    parseVoiceInputPreferences({
      ...prefs,
      transcription: { ...selection, approvedDestination: 'https://provider.example' },
    })
  ).toBeNull();
  expect(
    parseVoiceInputPreferences({
      ...prefs,
      correction: { ...prefs.correction, prompt: 'must be local' },
    })
  ).toBeNull();
  expect(parseVoiceInputPreferences({ ...prefs, backend: 'automatic' })).toBeNull();
  expect(resolveVoiceInputPreferences({ ...legacy, backend: 'model' }).backend).toBe('model');
});

it('requires capture admission and keeps private release ready events off public ports', async () => {
  const { parseVoiceInputCaptureEvent } = await import('./parsers');
  const scope = {
    entryId: 'entry',
    incarnation: 'incarnation',
    epoch: 'epoch',
    revision: 1,
    audioDigest: `sha256:${'a'.repeat(64)}`,
  };
  const released = { type: 'VOICE_INPUT_CAPTURE_RELEASED', sessionId: 'session' };
  const ready = {
    type: 'VOICE_INPUT_CAPTURE_READY',
    sessionId: 'session',
    scope,
    rawTranscript: 'words',
    durationSeconds: 1,
  };
  expect(parseVoiceInputCaptureEvent(released)).toEqual(released);
  expect(parseVoiceInputCaptureEvent(ready)).toEqual(ready);
  expect(
    parseOffscreenVoiceInputRuntimeMessage({
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
      event: ready,
    })
  ).toEqual({ type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT, event: ready });
  expect(parseVoiceInputServerEvent(ready)).toBeNull();
  expect(parseVoiceInputServerEvent(released)).toBeNull();
  expect(parseVoiceInputCaptureEvent({ ...ready, durationSeconds: Infinity })).toBeNull();
  expect(
    parseVoiceInputCaptureEvent({
      ...ready,
      rawTranscript: 'x'.repeat(VOICE_INPUT_TRANSCRIPT_MAX_CHARS + 1),
    })
  ).toBeNull();
  expect(
    parseVoiceInputCaptureEvent({ ...ready, scope: { ...scope, path: '/private' } })
  ).toBeNull();
  expect(parseVoiceInputCaptureEvent({ ...released, audio: 'bytes' })).toBeNull();
  expect(
    parseOffscreenVoiceInputRuntimeMessage({
      capabilityToken: 'capability',
      maxDurationMs: null,
      preferences: { language: 'ru-RU', mode: 'local-first' },
      quality: 'dictation',
      requestId: 'request',
      sessionId: 'session',
      type: MessageType.OFFSCREEN_VOICE_INPUT_START,
    })
  ).toBeNull();
  expect(
    parseVoiceInputPortRequest({
      type: VoiceInputPortMessageType.CANCEL,
      requestId: 'request',
      sessionId: 'session',
    })
  ).toMatchObject({ type: VoiceInputPortMessageType.CANCEL });
  expect(
    parseVoiceInputSnapshot({
      ...snapshot,
      delivery: 'final',
      effectiveMode: 'model',
      phase: 'processing-asr',
      errorCode: 'stale',
    })
  ).not.toBeNull();
});
