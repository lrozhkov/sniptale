// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MicrophoneAccessState } from '@sniptale/platform/browser/user-media';
import type { VoiceInputSnapshot } from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputSettingsError } from './controller-contract';

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  listMicrophones: vi.fn(),
  loadAvailability: vi.fn(),
  readPermission: vi.fn(),
  requestPermission: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/speech-recognition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/speech-recognition')>()),
  installSpeechRecognitionLanguage: mocks.install,
  loadSpeechRecognitionAvailability: mocks.loadAvailability,
}));
vi.mock('@sniptale/platform/browser/user-media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/user-media')>()),
  readMicrophoneAccessState: mocks.readPermission,
  listMicrophoneInputDevices: mocks.listMicrophones,
  requestMicrophoneAccess: mocks.requestPermission,
  subscribeToMicrophoneDeviceChanges: () => vi.fn(),
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn() }),
}));

import { useLocalVoiceCapability } from './use-local-voice-capability';

type Capability = ReturnType<typeof useLocalVoiceCapability>;

const initialSnapshot: VoiceInputSnapshot = {
  apiFlavor: 'unsupported',
  busyOwner: null,
  effectiveMode: null,
  errorCode: null,
  fallbackReason: null,
  language: 'ru-RU',
  localAvailability: 'unknown',
  phase: 'idle',
  quality: 'dictation',
  qualitySupported: false,
  requestedMode: 'local-first',
  sessionId: null,
};

let container: HTMLDivElement;
let current: {
  capability: Capability;
  error: VoiceInputSettingsError;
  snapshot: VoiceInputSnapshot;
} | null;
let root: Root;

function Harness() {
  const [error, setError] = useState<VoiceInputSettingsError>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const capability = useLocalVoiceCapability({
    language: 'ru-RU',
    mode: 'local-first',
    setError,
    setSnapshot,
  });
  current = { capability, error, snapshot };
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.install.mockResolvedValue(true);
  mocks.listMicrophones.mockResolvedValue([{ deviceId: 'microphone-1', label: 'Desk microphone' }]);
  mocks.loadAvailability.mockResolvedValue({
    apiFlavor: 'standard',
    availability: 'available',
    qualitySupported: true,
  });
  mocks.readPermission.mockResolvedValue('prompt');
  mocks.requestPermission.mockResolvedValue('granted');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  current = null;
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('local voice capability', () => {
  it('refreshes permission and local dictation capability together', async () => {
    await act(async () => current?.capability.actions.refresh());
    expect(current?.capability.state.microphoneAccess).toBe('prompt');
    expect(current?.snapshot).toMatchObject({
      apiFlavor: 'standard',
      language: 'ru-RU',
      localAvailability: 'available',
      phase: 'idle',
      qualitySupported: true,
      requestedMode: 'local-first',
    });
  });

  it('normalizes availability failure and a denied explicit permission request', async () => {
    mocks.loadAvailability.mockRejectedValueOnce(new Error('private availability detail'));
    await act(async () => current?.capability.actions.refresh());
    expect(current?.snapshot.localAvailability).toBe('unknown');
    expect(current?.capability.state.checking).toBe(false);

    mocks.requestPermission.mockResolvedValueOnce('denied' satisfies MicrophoneAccessState);
    await act(async () => current?.capability.actions.requestMicrophone());
    expect(current?.capability.state.microphoneAccess).toBe('denied');
    expect(current?.error).toBe('permission');
  });

  it('rechecks dictation availability after an explicit microphone grant', async () => {
    mocks.requestPermission.mockResolvedValueOnce('granted' satisfies MicrophoneAccessState);
    await act(async () => current?.capability.actions.requestMicrophone());
    expect(mocks.loadAvailability).toHaveBeenCalledOnce();
    expect(current?.capability.state.microphoneAccess).toBe('granted');
    expect(current?.capability.state.microphones).toEqual([
      { deviceId: 'microphone-1', label: 'Desk microphone' },
    ]);
    expect(current?.error).toBeNull();
  });

  it('ignores completion from an older availability generation', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    mocks.loadAvailability
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
      )
      .mockResolvedValueOnce({
        apiFlavor: 'standard',
        availability: 'downloadable',
        qualitySupported: true,
      });
    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    act(() => {
      first = current?.capability.actions.refresh();
      second = current?.capability.actions.refresh();
    });
    await act(async () => second);
    resolveFirst?.({
      apiFlavor: 'standard',
      availability: 'unavailable',
      qualitySupported: true,
    });
    await act(async () => first);
    expect(current?.snapshot.localAvailability).toBe('downloadable');
  });
});
