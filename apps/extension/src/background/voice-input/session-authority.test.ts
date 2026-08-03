import { describe, expect, it } from 'vitest';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import type { ActiveVoiceInputSession } from './protocol';
import { VoiceInputSessionAuthority } from './session-authority';

function createSession(sessionId: string): ActiveVoiceInputSession {
  return {
    consumerId: 'settings-test',
    documentId: `document-${sessionId}`,
    maxDurationMs: 30_000,
    offscreenObserved: false,
    offscreenSessionId: `offscreen-${sessionId}`,
    port: createRuntimePortFixture().port,
    preferences: {
      language: 'ru-RU',
      microphoneDeviceId: null,
      mode: 'local-first',
    },
    startRollbackPending: false,
    stopCleanupPending: false,
    sessionId,
  };
}

describe('voice input session authority', () => {
  it('owns begin, snapshot replacement, exact clear, and reset transitions', () => {
    const authority = new VoiceInputSessionAuthority();
    expect(authority.active).toBeNull();
    expect(authority.snapshot).toMatchObject({ phase: 'idle', sessionId: null });

    const active = createSession('active');
    const other = createSession('other');
    const starting = { ...authority.snapshot, phase: 'starting' as const, sessionId: 'active' };
    authority.begin(active, starting);
    expect(authority.active).toBe(active);
    expect(authority.owns(active)).toBe(true);
    expect(authority.owns(other)).toBe(false);
    expect(authority.snapshot).toBe(starting);

    expect(authority.clearIf(other)).toBe(false);
    expect(authority.active).toBe(active);
    const listening = { ...starting, phase: 'listening' as const };
    authority.replaceSnapshot(listening);
    expect(authority.snapshot).toBe(listening);
    expect(authority.clearIf(active)).toBe(true);
    expect(authority.active).toBeNull();

    const idle = authority.reset({
      language: 'en-US',
      microphoneDeviceId: 'not-retained-in-snapshot',
      mode: 'browser-managed',
    });
    expect(idle).toMatchObject({
      language: 'en-US',
      phase: 'idle',
      requestedMode: 'browser-managed',
      sessionId: null,
    });
    expect(authority.snapshot).toBe(idle);
  });
});
