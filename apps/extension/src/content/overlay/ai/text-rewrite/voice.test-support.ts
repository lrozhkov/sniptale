import { act } from 'react';
import { vi } from 'vitest';
import type { VoiceInputServerEvent } from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputClient, VoiceInputClientListener } from '../../../../workflows/voice-input';

const state = vi.hoisted((): { client: VoiceInputClient | null } => ({ client: null }));
vi.mock('../../../../workflows/voice-input', async (original) => ({
  ...(await original<typeof import('../../../../workflows/voice-input')>()),
  createVoiceInputClient: () => voiceFixture.client,
}));
let listeners = new Set<VoiceInputClientListener>();

/** Supplies only the external voice client boundary for the real content voice hook. */
export const voiceFixture = {
  get client(): VoiceInputClient {
    if (!state.client) throw new Error('Voice fixture is not initialized');
    return state.client;
  },
  reset() {
    listeners = new Set();
    state.client = {
      disconnect: vi.fn(),
      refresh: vi.fn(() => 'refresh-1'),
      start: vi.fn(() => 'session-1'),
      stop: vi.fn(() => 'stop-1'),
      cancel: vi.fn(() => 'cancel-1'),
      subscribe: vi.fn((listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
    };
  },
  emit(event: VoiceInputServerEvent) {
    act(() => listeners.forEach((listener) => listener(event)));
  },
};
