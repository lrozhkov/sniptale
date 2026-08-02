import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';

const { handleVoiceInputOffscreenEvent, subscribeToConnections } = vi.hoisted(() => ({
  handleVoiceInputOffscreenEvent: vi.fn(),
  subscribeToConnections: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: { subscribeToConnections },
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://extension-id/${path}`,
  },
}));
vi.mock('./coordinator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./coordinator')>()),
  handleVoiceInputOffscreenEvent,
}));

import {
  registerVoiceInputTelemetryPort,
  registerVoiceInputTelemetryPorts,
} from './telemetry-port';

const frame = {
  level: 0.42,
  peaks: Array.from({ length: 16 }, () => 0.42),
  sessionId: 'session-1',
  type: VoiceInputPortMessageType.AUDIO_LEVEL,
};

function createTelemetryPort(url: string) {
  return createRuntimePortFixture({
    name: 'sniptale:voice-input-telemetry:v1',
    sender: { url },
  });
}

describe('background voice input telemetry Port', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts bounded level frames only from the exact offscreen document', () => {
    const port = createTelemetryPort(
      'chrome-extension://extension-id/apps/extension/src/offscreen/offscreen.html'
    );
    const onLevel = vi.fn();
    const logger = { debug: vi.fn(), warn: vi.fn() };

    expect(registerVoiceInputTelemetryPort({ logger, onLevel, port: port.port })).toBe(true);
    port.onMessage.emit(frame);
    expect(onLevel).toHaveBeenCalledWith(frame);
    expect(port.disconnect).not.toHaveBeenCalled();
  });

  it('registers the telemetry listener and forwards an authenticated frame to session authority', () => {
    let connectionListener: ((port: chrome.runtime.Port) => void) | undefined;
    const unsubscribe = vi.fn();
    subscribeToConnections.mockImplementation((listener) => {
      connectionListener = listener;
      return unsubscribe;
    });
    expect(registerVoiceInputTelemetryPorts()).toBe(unsubscribe);

    const port = createTelemetryPort(
      'chrome-extension://extension-id/apps/extension/src/offscreen/offscreen.html'
    );
    connectionListener?.(port.port);
    port.onMessage.emit(frame);

    expect(handleVoiceInputOffscreenEvent).toHaveBeenCalledWith({
      event: frame,
      type: 'OFFSCREEN_VOICE_INPUT_EVENT',
    });
  });

  it('rejects lookalike senders and malformed or non-telemetry frames', () => {
    const logger = { debug: vi.fn(), warn: vi.fn() };
    const rejected = createTelemetryPort(
      'chrome-extension://extension-id/apps/extension/src/offscreen/offscreen.html.evil'
    );
    expect(registerVoiceInputTelemetryPort({ logger, onLevel: vi.fn(), port: rejected.port })).toBe(
      true
    );
    expect(rejected.disconnect).toHaveBeenCalledOnce();

    const accepted = createTelemetryPort(
      'chrome-extension://extension-id/apps/extension/src/offscreen/offscreen.html'
    );
    const onLevel = vi.fn();
    registerVoiceInputTelemetryPort({ logger, onLevel, port: accepted.port });
    accepted.onMessage.emit({ ...frame, peaks: [0.4] });
    expect(onLevel).not.toHaveBeenCalled();
    expect(accepted.disconnect).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith('Rejected malformed voice input telemetry frame');
  });
});
