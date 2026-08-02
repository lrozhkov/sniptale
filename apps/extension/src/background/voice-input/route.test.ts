import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';

const handleVoiceInputOffscreenEvent = vi.hoisted(() => vi.fn());

vi.mock('./coordinator', () => ({
  cleanupVoiceInputForPrivacyErasure: vi.fn(),
  createVoiceInputCoordinator: vi.fn(),
  handleVoiceInputOffscreenEvent,
  registerVoiceInputPorts: vi.fn(),
}));

import { routeVoiceInputOffscreenEvent } from './route';

describe('voice input offscreen event route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a parsed event and acknowledges it', () => {
    const sendResponse = vi.fn();
    const message = {
      event: {
        confidence: 0.7,
        isFinal: true,
        sequence: 1,
        sessionId: 'session-1',
        text: 'result',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      },
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    };

    expect(routeVoiceInputOffscreenEvent(message, sendResponse)).toBe(true);
    expect(handleVoiceInputOffscreenEvent).toHaveBeenCalledWith(message);
    expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  });

  it('accepts bounded audio-level telemetry without transcript payloads', () => {
    const sendResponse = vi.fn();
    const message = {
      event: {
        level: 0.4,
        sessionId: 'session-1',
        type: VoiceInputPortMessageType.AUDIO_LEVEL,
      },
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    };
    expect(routeVoiceInputOffscreenEvent(message, sendResponse)).toBe(true);
    expect(handleVoiceInputOffscreenEvent).toHaveBeenCalledWith(message);
    expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  });

  it('fails closed for malformed payloads', () => {
    const sendResponse = vi.fn();
    expect(
      routeVoiceInputOffscreenEvent(
        { event: { text: 'missing metadata' }, type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT },
        sendResponse
      )
    ).toBe(false);
    expect(handleVoiceInputOffscreenEvent).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
