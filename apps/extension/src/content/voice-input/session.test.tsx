// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  VoiceInputPortMessageType,
  type VoiceInputServerEvent,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputClient, VoiceInputClientListener } from '../../workflows/voice-input';

vi.mock('../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/settings')>()),
  loadSettings: vi.fn(async () => ({
    voiceInput: { language: 'en-US', microphoneDeviceId: null, mode: 'browser-managed' },
  })),
}));

import { useContentVoiceInputSession } from './session';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof useContentVoiceInputSession> | null = null;
let listeners: Set<VoiceInputClientListener>;
let client: VoiceInputClient;
const onTranscript = vi.fn();

function Harness() {
  latest = useContentVoiceInputSession({ createClient: () => client, onTranscript });
  return null;
}

function emit(event: VoiceInputServerEvent): void {
  act(() => {
    for (const listener of listeners) listener(event);
  });
}

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));

beforeEach(() => {
  listeners = new Set();
  client = {
    disconnect: vi.fn(),
    refresh: vi.fn(() => 'refresh-1'),
    start: vi.fn(() => 'session-1'),
    stop: vi.fn(() => 'stop-1'),
    subscribe: vi.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  onTranscript.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  latest = null;
});

it('routes only the owning session transcript and stops accepting after stop', async () => {
  await act(async () => latest?.actions.start());
  const transcript = {
    confidence: 0.8,
    isFinal: false,
    sequence: 0,
    text: 'spoken',
    type: VoiceInputPortMessageType.TRANSCRIPT,
  } as const;
  emit({ ...transcript, sessionId: 'foreign' });
  emit({ ...transcript, sessionId: 'session-1' });
  expect(onTranscript).toHaveBeenCalledOnce();

  act(() => latest?.actions.stop());
  emit({ ...transcript, sequence: 1, sessionId: 'session-1', text: 'late' });
  expect(onTranscript).toHaveBeenCalledOnce();
  expect(client.stop).toHaveBeenCalledWith('session-1');
});
