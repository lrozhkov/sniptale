// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VoiceInputPortMessageType,
  type VoiceInputServerEvent,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputClient } from '../../../../workflows/voice-input';

vi.mock('@sniptale/platform/browser/speech-recognition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/speech-recognition')>()),
  resolveSpeechRecognitionApi: () => ({
    constructor: class {},
    flavor: 'standard',
    qualitySupported: true,
  }),
}));

import { useVoiceInputSessionState } from './use-voice-input-session';

type SessionState = ReturnType<typeof useVoiceInputSessionState>;

const availableSnapshot: VoiceInputSnapshot = {
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

let container: HTMLDivElement;
let current: SessionState | null;
let root: Root;
const onRuntimeFailure = vi.fn();
const client: VoiceInputClient = {
  disconnect: vi.fn(),
  refresh: vi.fn().mockReturnValue('refresh-1'),
  start: vi.fn().mockReturnValue('session-1'),
  stop: vi.fn().mockReturnValue('stop-1'),
  subscribe: vi.fn().mockReturnValue(vi.fn()),
};

function Harness() {
  current = useVoiceInputSessionState({
    initialLanguage: 'ru-RU',
    initialMode: 'local-first',
    onRuntimeFailure,
  });
  return null;
}

function apply(event: VoiceInputServerEvent): void {
  act(() => current?.connection.applyServerEvent(event));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  current = null;
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('voice input session state', () => {
  it('owns one session and ignores stale transcript generations and sequences', () => {
    act(() =>
      current?.connection.begin(client, {
        language: 'ru-RU',
        microphoneDeviceId: null,
        mode: 'local-first',
      })
    );
    apply({
      level: 0.9,
      peaks: Array.from({ length: 16 }, () => 0.9),
      sessionId: 'other-session',
      type: VoiceInputPortMessageType.AUDIO_LEVEL,
    });
    apply({
      level: 0.42,
      peaks: Array.from({ length: 16 }, () => 0.42),
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.AUDIO_LEVEL,
    });
    apply({
      confidence: 0.4,
      isFinal: false,
      sequence: 1,
      sessionId: 'other-session',
      text: 'other',
      type: VoiceInputPortMessageType.TRANSCRIPT,
    });
    apply({
      confidence: 0.5,
      isFinal: false,
      sequence: 1,
      sessionId: 'session-1',
      text: 'interim',
      type: VoiceInputPortMessageType.TRANSCRIPT,
    });
    apply({
      confidence: 0.8,
      isFinal: true,
      sequence: 2,
      sessionId: 'session-1',
      text: 'final',
      type: VoiceInputPortMessageType.TRANSCRIPT,
    });
    apply({
      confidence: 0.2,
      isFinal: false,
      sequence: 1,
      sessionId: 'session-1',
      text: 'stale',
      type: VoiceInputPortMessageType.TRANSCRIPT,
    });

    expect(current?.transcript.finalText).toBe('final');
    expect(current?.transcript.interimText).toBe('');
    expect(current?.snapshotState.audioLevel).toBe(0.42);
    expect(current?.snapshotState.audioPeaks).toEqual(Array.from({ length: 16 }, () => 0.42));
    act(() => current?.connection.stop(client));
    expect(client.stop).toHaveBeenCalledWith('session-1');
    expect(current?.snapshotState.snapshot.phase).toBe('stopping');
  });

  it('clears stale microphone level feedback when a session finishes', () => {
    act(() =>
      current?.connection.begin(client, {
        language: 'ru-RU',
        microphoneDeviceId: null,
        mode: 'local-first',
      })
    );
    apply({
      level: 0.7,
      peaks: Array.from({ length: 16 }, () => 0.7),
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.AUDIO_LEVEL,
    });
    apply({
      snapshot: { ...availableSnapshot, phase: 'ended' },
      type: VoiceInputPortMessageType.SNAPSHOT,
    });

    expect(current?.snapshotState.audioLevel).toBe(0);
    expect(current?.snapshotState.audioPeaks).toEqual(Array.from({ length: 16 }, () => 0));
  });

  it('merges capability knowledge into an idle reconciliation snapshot', () => {
    act(() =>
      current?.snapshotState.setSnapshot((snapshot) => ({
        ...snapshot,
        localAvailability: 'available',
      }))
    );
    apply({
      requestId: 'status-1',
      snapshot: {
        ...availableSnapshot,
        apiFlavor: 'unsupported',
        effectiveMode: null,
        language: 'en-US',
        localAvailability: 'unknown',
        phase: 'idle',
        qualitySupported: false,
        requestedMode: 'browser-managed',
        sessionId: null,
      },
      type: VoiceInputPortMessageType.SNAPSHOT,
    });

    expect(current?.snapshotState.snapshot).toMatchObject({
      apiFlavor: 'standard',
      language: 'ru-RU',
      localAvailability: 'available',
      requestedMode: 'local-first',
    });

    apply({ snapshot: availableSnapshot, type: VoiceInputPortMessageType.SNAPSHOT });
    expect(current?.snapshotState.snapshot).toEqual(availableSnapshot);
  });

  it('clears terminal interim text, reports failures, and keeps the result editable', () => {
    act(() => current?.connection.stop(client));
    expect(client.stop).not.toHaveBeenCalled();
    act(() =>
      current?.connection.begin(client, {
        language: 'ru-RU',
        microphoneDeviceId: null,
        mode: 'local-first',
      })
    );
    apply({
      confidence: null,
      isFinal: false,
      sequence: 1,
      sessionId: 'session-1',
      text: 'partial',
      type: VoiceInputPortMessageType.TRANSCRIPT,
    });
    apply({
      errorCode: 'network',
      sessionId: 'session-1',
      snapshot: { ...availableSnapshot, errorCode: 'network', phase: 'error' },
      type: VoiceInputPortMessageType.FAILURE,
    });
    expect(onRuntimeFailure).toHaveBeenCalledOnce();
    expect(current?.transcript.interimText).toBe('');

    act(() => current?.transcript.setFinalText('editable'));
    expect(current?.transcript.finalText).toBe('editable');
  });
});
