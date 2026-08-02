import { describe, expect, it, vi } from 'vitest';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import { createVoiceInputTelemetryPort } from './telemetry-port';

const levelEvent = {
  level: 0.42,
  peaks: Array.from({ length: 16 }, () => 0.42),
  sessionId: 'session-1',
  type: VoiceInputPortMessageType.AUDIO_LEVEL,
} as const;

describe('offscreen voice input telemetry Port', () => {
  it('streams live levels and reconnects after a service worker restart', () => {
    const first = createRuntimePortFixture();
    const second = createRuntimePortFixture();
    const connect = vi.fn().mockReturnValueOnce(first.port).mockReturnValueOnce(second.port);
    const telemetry = createVoiceInputTelemetryPort({
      connect,
      logger: { debug: vi.fn(), warn: vi.fn() },
    });

    expect(telemetry.send(levelEvent)).toBe(true);
    expect(connect).toHaveBeenCalledWith({ name: 'sniptale:voice-input-telemetry:v1' });
    expect(first.postMessage).toHaveBeenCalledWith(levelEvent);

    first.onDisconnect.emit(first.port);
    expect(telemetry.send({ ...levelEvent, level: 0.7 })).toBe(true);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(second.postMessage).toHaveBeenCalledWith({ ...levelEvent, level: 0.7 });

    telemetry.close();
    expect(second.disconnect).toHaveBeenCalledOnce();
  });

  it('retries one synchronous post failure without surfacing a recovered outage', () => {
    const failed = createRuntimePortFixture();
    failed.postMessage.mockImplementation(() => {
      throw new Error('private browser detail');
    });
    const replacement = createRuntimePortFixture();
    const logger = { debug: vi.fn(), warn: vi.fn() };
    const telemetry = createVoiceInputTelemetryPort({
      connect: vi.fn().mockReturnValueOnce(failed.port).mockReturnValue(replacement.port),
      logger,
    });

    expect(telemetry.send(levelEvent)).toBe(true);
    expect(replacement.postMessage).toHaveBeenCalledWith(levelEvent);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs one sanitized warning while repeated delivery attempts remain unavailable', () => {
    const failed = createRuntimePortFixture();
    failed.postMessage.mockImplementation(() => {
      throw new Error('private browser detail');
    });
    const logger = { debug: vi.fn(), warn: vi.fn() };
    const telemetry = createVoiceInputTelemetryPort({
      connect: vi.fn().mockReturnValue(failed.port),
      logger,
    });

    expect(telemetry.send(levelEvent)).toBe(false);
    expect(telemetry.send(levelEvent)).toBe(false);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      'Voice input level telemetry is temporarily unavailable',
      { sessionId: 'session-1' }
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private browser detail');
  });
});
