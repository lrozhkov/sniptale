import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';
import { runtimeVoiceInputMessageContracts } from './voice-input';

const snapshot = {
  apiFlavor: 'standard',
  busyOwner: null,
  effectiveMode: null,
  errorCode: null,
  fallbackReason: null,
  language: 'ru-RU',
  localAvailability: 'available',
  phase: 'idle',
  quality: 'dictation',
  qualitySupported: true,
  requestedMode: 'local-first',
  sessionId: null,
} as const;

describe('voice input runtime contracts', () => {
  it('parses every signed command and the sanitized offscreen event', () => {
    const commands = [
      {
        capabilityToken: 'capability',
        requestId: 'status-1',
        type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
      },
      {
        capabilityToken: 'capability',
        maxDurationMs: null,
        preferences: { language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' },
        quality: 'dictation',
        requestId: 'start-1',
        sessionId: 'session-1',
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      },
      {
        capabilityToken: 'capability',
        force: false,
        requestId: 'stop-1',
        sessionId: 'session-1',
        type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
      },
      {
        event: { snapshot, type: VoiceInputPortMessageType.SNAPSHOT },
        type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
      },
    ] as const;

    for (const command of commands) {
      expect(runtimeVoiceInputMessageContracts[command.type].parseRequest(command)).toEqual(
        command
      );
    }
  });

  it('accepts the bounded response variants and rejects malformed data', () => {
    const contract = runtimeVoiceInputMessageContracts[MessageType.OFFSCREEN_VOICE_INPUT_STOP];
    expect(contract.parseResponse({ result: 'accepted', success: true })).toEqual({
      result: 'accepted',
      success: true,
    });
    expect(contract.parseResponse({ result: 'stale', success: true })).toEqual({
      result: 'stale',
      success: true,
    });
    expect(contract.parseResponse({ snapshot, success: true })).toEqual({
      snapshot,
      success: true,
    });
    expect(() => contract.parseResponse({ rawError: 'private', success: true })).toThrow();
    expect(() => contract.parseResponse({ result: 'future', success: true })).toThrow();
  });
});
