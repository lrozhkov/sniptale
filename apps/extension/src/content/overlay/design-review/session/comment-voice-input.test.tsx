// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  VoiceInputPortMessageType,
  type VoiceInputServerEvent,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputClient, VoiceInputClientListener } from '../../../../workflows/voice-input';

const settingsMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(async () => ({
    voiceInput: { language: 'en-US', microphoneDeviceId: 'mic-2', mode: 'browser-managed' },
  })),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: settingsMocks.loadSettings,
}));

import { useDesignReviewCommentVoiceInput } from './comment-voice-input';

let host: HTMLDivElement;
let root: Root;
let latest: ReturnType<typeof useDesignReviewCommentVoiceInput> | null;
let listeners: Set<VoiceInputClientListener>;
let client: VoiceInputClient;
let updateDraft: ReturnType<typeof vi.fn<(value: string) => void>>;

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
  latest = useDesignReviewCommentVoiceInput({ createClient: () => client, updateDraft });
  return null;
}

function emit(event: VoiceInputServerEvent): void {
  act(() => listeners.forEach((listener) => listener(event)));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  listeners = new Set();
  updateDraft = vi.fn<(value: string) => void>();
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
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  latest = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('starts with persisted preferences and streams only the owning session into the caret span', async () => {
  await act(async () => latest?.actions.start('Before after', 7));

  expect(client.start).toHaveBeenCalledWith({
    language: 'en-US',
    microphoneDeviceId: 'mic-2',
    mode: 'browser-managed',
  });
  emit({
    confidence: 0.8,
    isFinal: false,
    sequence: 0,
    sessionId: 'other-session',
    text: 'ignored',
    type: VoiceInputPortMessageType.TRANSCRIPT,
  });
  emit({
    confidence: 0.8,
    isFinal: false,
    sequence: 0,
    sessionId: 'session-1',
    text: 'spoken ',
    type: VoiceInputPortMessageType.TRANSCRIPT,
  });

  expect(updateDraft).toHaveBeenCalledOnce();
  expect(updateDraft).toHaveBeenCalledWith('Before spoken after');
  expect(latest?.state.caretPosition).toBe(14);
});

it('cancels a pending start and ignores delayed transcript after stop', async () => {
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
    void latest?.actions.start('Keep', 4);
    void latest?.actions.start('Keep', 4);
    latest?.actions.stop();
  });
  await act(async () => {
    resolveSettings?.({
      voiceInput: { language: 'en-US', microphoneDeviceId: 'mic-2', mode: 'browser-managed' },
    });
  });

  expect(client.start).not.toHaveBeenCalled();
  expect(latest?.state.phase).toBe('idle');

  await act(async () => latest?.actions.start('Keep', 4));
  emit({
    confidence: 0.7,
    isFinal: false,
    sequence: 0,
    sessionId: 'session-1',
    text: ' heard',
    type: VoiceInputPortMessageType.TRANSCRIPT,
  });
  act(() => latest?.actions.stop());
  emit({
    confidence: null,
    isFinal: true,
    sequence: 1,
    sessionId: 'session-1',
    text: ' delayed',
    type: VoiceInputPortMessageType.TRANSCRIPT,
  });

  expect(client.stop).toHaveBeenCalledWith('session-1');
  expect(updateDraft).toHaveBeenCalledOnce();
  expect(updateDraft).toHaveBeenCalledWith('Keep heard');
});

it('keeps a locally stopped session inactive when a delayed listening snapshot arrives', async () => {
  await act(async () => latest?.actions.start('Keep', 4));

  act(() => latest?.actions.stop());
  expect(latest?.state.phase).toBe('stopping');
  emit({ snapshot: listeningSnapshot, type: VoiceInputPortMessageType.SNAPSHOT });

  expect(latest?.state.phase).toBe('stopping');
  expect(latest?.state.active).toBe(false);

  emit({
    snapshot: { ...listeningSnapshot, phase: 'idle' },
    type: VoiceInputPortMessageType.SNAPSHOT,
  });
  expect(latest?.state.phase).toBe('idle');
});

it('does not start recognition after its owner unmounts during settings loading', async () => {
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
    void latest?.actions.start('Keep', 4);
    root.unmount();
  });
  await act(async () => {
    resolveSettings?.({
      voiceInput: { language: 'en-US', microphoneDeviceId: 'mic-2', mode: 'browser-managed' },
    });
  });

  expect(client.start).not.toHaveBeenCalled();
  expect(client.disconnect).toHaveBeenCalledOnce();
  root = createRoot(host);
});

it('stops the active session and disconnects the Port when its owner unmounts', async () => {
  await act(async () => latest?.actions.start('', 0));
  act(() => root.unmount());

  expect(client.stop).toHaveBeenCalledWith('session-1');
  expect(client.disconnect).toHaveBeenCalledOnce();
  root = createRoot(host);
});
