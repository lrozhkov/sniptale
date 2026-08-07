// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  VoiceInputPortMessageType,
  type VoiceInputServerEvent,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputClient, VoiceInputClientListener } from '../../workflows/voice-input';

const settingsMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(async () => ({
    voiceInput: { language: 'en-US', microphoneDeviceId: null, mode: 'browser-managed' },
  })),
}));

vi.mock('../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/settings')>()),
  loadSettings: settingsMocks.loadSettings,
}));

import { useContentVoiceInputSession } from './session';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof useContentVoiceInputSession> | null = null;
let listeners: Set<VoiceInputClientListener>;
let client: VoiceInputClient;
const onTranscript = vi.fn();
const listeningSnapshot: VoiceInputSnapshot = {
  apiFlavor: 'standard',
  busyOwner: null,
  effectiveMode: 'local',
  errorCode: null,
  fallbackReason: null,
  language: 'en-US',
  localAvailability: 'available',
  phase: 'listening',
  quality: 'dictation',
  qualitySupported: true,
  requestedMode: 'browser-managed',
  sessionId: 'session-1',
};

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
  settingsMocks.loadSettings.mockResolvedValue({
    voiceInput: { language: 'en-US', microphoneDeviceId: null, mode: 'browser-managed' },
  });
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

it('tracks level and snapshot phases and clears terminal session state', async () => {
  await act(async () => latest?.actions.start());
  emit({ snapshot: listeningSnapshot, type: VoiceInputPortMessageType.SNAPSHOT });
  emit({
    level: 0.65,
    peaks: Array.from({ length: 16 }, () => 0.65),
    sessionId: 'session-1',
    type: VoiceInputPortMessageType.AUDIO_LEVEL,
  });
  expect(latest?.state).toMatchObject({ active: true, audioLevel: 0.65, phase: 'listening' });

  emit({
    snapshot: { ...listeningSnapshot, phase: 'stopping' },
    type: VoiceInputPortMessageType.SNAPSHOT,
  });
  expect(latest?.state.phase).toBe('stopping');
  emit({
    snapshot: { ...listeningSnapshot, phase: 'ended' },
    type: VoiceInputPortMessageType.SNAPSHOT,
  });
  expect(latest?.state).toMatchObject({ active: false, audioLevel: 0, phase: 'idle' });
});

it('surfaces server, start, and stop failures without retaining an active session', async () => {
  await act(async () => latest?.actions.start());
  emit({
    errorCode: 'busy-speech',
    sessionId: 'session-1',
    snapshot: { ...listeningSnapshot, errorCode: 'busy-speech', phase: 'error' },
    type: VoiceInputPortMessageType.FAILURE,
  });
  expect(latest?.state).toMatchObject({ active: false, errorCode: 'busy-speech', phase: 'error' });

  settingsMocks.loadSettings.mockRejectedValueOnce(new Error('settings unavailable'));
  await act(async () => latest?.actions.start());
  expect(latest?.state).toMatchObject({ active: false, errorCode: 'runtime', phase: 'error' });

  await act(async () => latest?.actions.start());
  vi.mocked(client.stop).mockImplementationOnce(() => {
    throw new Error('port closed');
  });
  act(() => latest?.actions.stop());
  expect(latest?.state).toMatchObject({ active: false, errorCode: 'runtime', phase: 'error' });
});

it('cancels a pending start and disconnects the client on unmount', async () => {
  let resolveSettings:
    | ((value: Awaited<ReturnType<typeof settingsMocks.loadSettings>>) => void)
    | null = null;
  settingsMocks.loadSettings.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSettings = resolve;
      })
  );
  act(() => {
    void latest?.actions.start();
    latest?.actions.stop();
    root?.unmount();
  });
  await act(async () =>
    resolveSettings?.({
      voiceInput: { language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' },
    })
  );
  expect(client.start).not.toHaveBeenCalled();
  expect(client.disconnect).toHaveBeenCalledOnce();
  root = null;
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
