// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  VoiceInputPreferences,
  VoiceInputServerEvent,
} from '@sniptale/runtime-contracts/voice-input';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';

const mocks = vi.hoisted(() => ({
  observeVoice: vi.fn(),
  reconcileVoice: vi.fn(),
  voicePreferences: {
    language: 'ru-RU',
    microphoneDeviceId: null,
    mode: 'local-first',
  } as VoiceInputPreferences,
  install: vi.fn(),
  listMicrophones: vi.fn(),
  loadAvailability: vi.fn(),
  readPermission: vi.fn(),
  requestPermission: vi.fn(),
  subscribePermission: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/speech-recognition', () => ({
  installSpeechRecognitionLanguage: mocks.install,
  loadSpeechRecognitionAvailability: mocks.loadAvailability,
  resolveSpeechRecognitionApi: () => ({
    constructor: class {},
    flavor: 'standard',
    qualitySupported: true,
  }),
}));

vi.mock('@sniptale/platform/browser/user-media', () => ({
  listMicrophoneInputDevices: mocks.listMicrophones,
  readMicrophoneAccessState: mocks.readPermission,
  requestMicrophoneAccess: mocks.requestPermission,
  subscribeToMicrophoneAccessChanges: mocks.subscribePermission,
  subscribeToMicrophoneDeviceChanges: () => vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn() }),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  subscribeToVoiceInputPreferencesChanges: mocks.observeVoice,
}));

vi.mock('../../../runtime/store/useSettingsStore', () => ({
  createSettingsStore: vi.fn(),
  useSettingsStore: () => ({
    settings: {
      voiceInput: mocks.voicePreferences,
    },
    updateSettings: mocks.updateSettings,
    reconcileVoiceInputPreferences: mocks.reconcileVoice,
  }),
}));

import type { VoiceInputSettingsController } from './controller-contract';
vi.mock('./use-voice-model-selection', () => ({ useVoiceModelSelection: () => ({}) }));

import { useVoiceInputSettings } from './use-voice-input';
import type { VoiceInputClient } from '../../../../workflows/voice-input';

let container: HTMLDivElement;
let root: Root;
let current: VoiceInputSettingsController | null = null;
let serverListener: ((event: VoiceInputServerEvent) => void) | null = null;
let permissionListener: ((state: 'granted' | 'denied') => void) | null = null;
let client: VoiceInputClient;

function Harness() {
  current = useVoiceInputSettings(() => client);
  return null;
}

async function renderHook(): Promise<void> {
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.voicePreferences = { language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' };
  mocks.observeVoice.mockReturnValue(vi.fn());
  mocks.reconcileVoice.mockImplementation((preferences: VoiceInputPreferences) => {
    mocks.voicePreferences = preferences;
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  current = null;
  serverListener = null;
  permissionListener = null;
  mocks.readPermission.mockResolvedValue('granted');
  mocks.requestPermission.mockResolvedValue('granted');
  mocks.subscribePermission.mockImplementation(async (listener) => {
    permissionListener = listener;
    return vi.fn();
  });
  mocks.loadAvailability.mockResolvedValue({
    apiFlavor: 'standard',
    availability: 'downloadable',
    qualitySupported: true,
  });
  mocks.listMicrophones.mockResolvedValue([]);
  mocks.install.mockResolvedValue(true);
  mocks.updateSettings.mockResolvedValue(undefined);
  client = {
    cancel: vi.fn().mockReturnValue('cancel-1'),
    disconnect: vi.fn(),
    refresh: vi.fn().mockReturnValue('status-1'),
    start: vi.fn().mockReturnValue('session-1'),
    stop: vi.fn().mockReturnValue('stop-1'),
    subscribe: vi.fn((listener) => {
      serverListener = listener;
      return vi.fn();
    }),
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('voice input Settings controller', () => {
  it('installs the local package from Start before opening the offscreen session', async () => {
    const order: string[] = [];
    mocks.install.mockImplementation(() => {
      order.push('install');
      return Promise.resolve(true);
    });
    mocks.loadAvailability
      .mockResolvedValueOnce({
        apiFlavor: 'standard',
        availability: 'downloadable',
        qualitySupported: true,
      })
      .mockResolvedValue({
        apiFlavor: 'standard',
        availability: 'available',
        qualitySupported: true,
      });
    vi.mocked(client.start).mockImplementation(() => {
      order.push('start');
      return 'session-1';
    });
    await renderHook();

    await act(async () => current?.actions.start());
    expect(mocks.install).toHaveBeenCalledWith('ru-RU');
    expect(order).toEqual(['install', 'start']);
    expect(client.start).toHaveBeenCalledWith({
      enabled: true,
      language: 'ru-RU',
      microphoneDeviceId: null,
      mode: 'local-first',
      backend: 'browser',
      transcription: null,
      correction: { enabled: false, model: null },
    });
  });

  it('keeps transcript in component state and ignores stale sequences', async () => {
    mocks.loadAvailability.mockResolvedValue({
      apiFlavor: 'standard',
      availability: 'available',
      qualitySupported: true,
    });
    await renderHook();
    await act(async () => current?.actions.start());
    act(() => {
      serverListener?.({
        confidence: 0.5,
        isFinal: false,
        sequence: 1,
        sessionId: 'session-1',
        text: 'interim',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      });
      serverListener?.({
        confidence: 0.6,
        isFinal: true,
        sequence: 2,
        sessionId: 'session-1',
        text: 'final',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      });
      serverListener?.({
        confidence: 0.2,
        isFinal: false,
        sequence: 1,
        sessionId: 'session-1',
        text: 'stale',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      });
    });
    expect(current?.transcript.finalText).toBe('final');
    expect(current?.transcript.interimText).toBe('');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('does not start while microphone permission is missing', async () => {
    mocks.readPermission.mockResolvedValue('denied');
    await renderHook();
    await act(async () => current?.actions.start());
    expect(client.start).not.toHaveBeenCalled();
    expect(current?.status.error).toBe('permission');
  });

  it('surfaces a failed runtime START and allows a later retry', async () => {
    mocks.loadAvailability.mockResolvedValue({
      apiFlavor: 'standard',
      availability: 'available',
      qualitySupported: true,
    });
    vi.mocked(client.start)
      .mockImplementationOnce(() => {
        throw new Error('runtime unavailable');
      })
      .mockReturnValueOnce('session-2');
    await renderHook();

    await act(async () => current?.actions.start());
    expect(current?.status.error).toBe('runtime');

    await act(async () => current?.actions.start());
    expect(client.start).toHaveBeenCalledTimes(2);
    expect(current?.status.error).toBeNull();
    expect(current?.status.snapshot.sessionId).toBe('session-2');
  });

  it('stops the owned session when microphone permission is revoked', async () => {
    mocks.loadAvailability.mockResolvedValue({
      apiFlavor: 'standard',
      availability: 'available',
      qualitySupported: true,
    });
    await renderHook();
    await act(async () => current?.actions.start());
    act(() => permissionListener?.('denied'));
    expect(client.cancel).toHaveBeenCalledWith('session-1');
  });

  it('ignores a stale install completion after the language changes', async () => {
    let resolveInstall!: (value: boolean) => void;
    mocks.install.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveInstall = resolve;
      })
    );
    await renderHook();
    let installation: Promise<void> | undefined;
    await act(async () => {
      installation = current?.actions.installPackage();
      await Promise.resolve();
    });
    await act(async () => current?.preferences.setLanguage('en-US'));
    resolveInstall(true);
    await act(async () => installation);

    expect(mocks.updateSettings).toHaveBeenCalledWith({ voiceInput: { language: 'en-US' } });
    expect(current?.status.error).toBeNull();
  });

  it('persists the selected microphone independently of language and mode', async () => {
    await renderHook();
    await act(async () => current?.preferences.setMicrophoneDeviceId('microphone-2'));
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      voiceInput: { microphoneDeviceId: 'microphone-2' },
    });
  });

  it('does not start recognition after the Settings owner unmounts during installation', async () => {
    let resolveInstall: ((value: boolean) => void) | undefined;
    mocks.install.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveInstall = resolve;
      })
    );
    await renderHook();
    let pendingStart: Promise<void> | undefined;
    act(() => {
      pendingStart = current?.actions.start();
    });
    await act(async () => Promise.resolve());
    act(() => root.unmount());
    root = createRoot(container);
    resolveInstall?.(true);
    await act(async () => pendingStart);

    expect(client.start).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledOnce();
  });

  it('cancels a pending Start when microphone permission is revoked', async () => {
    let resolveInstall: ((value: boolean) => void) | undefined;
    mocks.install.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveInstall = resolve;
      })
    );
    await renderHook();
    let pendingStart: Promise<void> | undefined;
    act(() => {
      pendingStart = current?.actions.start();
    });
    await act(async () => Promise.resolve());
    act(() => permissionListener?.('denied'));
    resolveInstall?.(true);
    await act(async () => pendingStart);

    expect(client.start).not.toHaveBeenCalled();
  });

  it('immediately disposes a permission subscription that resolves after unmount', async () => {
    let resolveSubscription: ((unsubscribe: () => void) => void) | undefined;
    const unsubscribe = vi.fn();
    mocks.subscribePermission.mockReturnValue(
      new Promise((resolve) => {
        resolveSubscription = resolve;
      })
    );
    await renderHook();
    act(() => root.unmount());
    root = createRoot(container);
    resolveSubscription?.(unsubscribe);
    await act(async () => Promise.resolve());

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

it('maps Off to a disabled preference while retaining backend and model bindings', async () => {
  await renderHook();
  await act(async () => current?.preferences.setBackend('off'));
  expect(mocks.updateSettings).toHaveBeenCalledWith({ voiceInput: { enabled: false } });
  await act(async () => current?.preferences.setBackend('model'));
  expect(mocks.updateSettings).toHaveBeenLastCalledWith({
    voiceInput: { enabled: true, backend: 'model' },
  });
});

it('cancels the Settings capture immediately when another window saves Off and rejects late text', async () => {
  mocks.loadAvailability.mockResolvedValue({
    apiFlavor: 'standard',
    availability: 'available',
    qualitySupported: true,
  });
  await renderHook();
  await act(async () => current?.actions.start());
  expect(client.start).toHaveBeenCalledOnce();
  const observe = mocks.observeVoice.mock.calls.at(-1)?.[0];
  act(() => {
    observe({ ...mocks.voicePreferences, enabled: false });
    serverListener?.({
      type: VoiceInputPortMessageType.TRANSCRIPT,
      sessionId: 'session-1',
      text: 'late',
      confidence: 1,
      isFinal: true,
      sequence: 0,
    });
  });
  expect(client.cancel).toHaveBeenCalledWith('session-1');
  expect(current?.transcript.finalText).toBe('');
  expect(current?.status.snapshot.phase).toBe('idle');
  await renderHook();
  expect(current?.preferences.enabled).toBe(false);
  act(() =>
    serverListener?.({
      type: VoiceInputPortMessageType.SNAPSHOT,
      snapshot: { ...current!.status.snapshot, phase: 'listening', sessionId: 'session-1' },
    })
  );
  expect(current?.status.snapshot.phase).toBe('idle');
  expect(mocks.reconcileVoice).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
});

it('invalidates a pending Settings Start when canonical Off arrives during installation', async () => {
  let finishInstall!: (installed: boolean) => void;
  mocks.install.mockReturnValue(
    new Promise<boolean>((resolve) => {
      finishInstall = resolve;
    })
  );
  await renderHook();
  let starting: Promise<void> | undefined;
  act(() => {
    starting = current?.actions.start();
  });
  await act(async () => Promise.resolve());
  const observe = mocks.observeVoice.mock.calls.at(-1)?.[0];
  act(() => observe({ ...mocks.voicePreferences, enabled: false }));
  await act(async () => {
    finishInstall(true);
    await starting;
  });
  await renderHook();
  expect(client.start).not.toHaveBeenCalled();
  expect(current?.preferences.enabled).toBe(false);
  expect(current?.status.snapshot.phase).toBe('idle');
});

it('clears foreign processing on Off and ignores delayed busy snapshots before re-enabling', async () => {
  mocks.loadAvailability.mockResolvedValue({
    apiFlavor: 'standard',
    availability: 'available',
    qualitySupported: true,
  });
  await renderHook();
  const foreignSnapshot = {
    ...current!.status.snapshot,
    delivery: 'final' as const,
    phase: 'processing-asr' as const,
    sessionId: 'foreign-session',
  };
  act(() =>
    serverListener?.({ type: VoiceInputPortMessageType.SNAPSHOT, snapshot: foreignSnapshot })
  );
  expect(current?.status.snapshot.phase).toBe('processing-asr');
  const observe = mocks.observeVoice.mock.calls.at(-1)?.[0];
  act(() => observe({ ...mocks.voicePreferences, enabled: false }));
  expect(current?.status.snapshot.phase).toBe('idle');
  expect(client.cancel).not.toHaveBeenCalled();
  act(() =>
    serverListener?.({ type: VoiceInputPortMessageType.SNAPSHOT, snapshot: foreignSnapshot })
  );
  expect(current?.status.snapshot.phase).toBe('idle');
  act(() =>
    serverListener?.({
      type: VoiceInputPortMessageType.SNAPSHOT,
      snapshot: { ...foreignSnapshot, phase: 'ended' },
    })
  );
  expect(current?.status.snapshot.phase).toBe('ended');
  act(() =>
    mocks.observeVoice.mock.calls.at(-1)?.[0]({ ...mocks.voicePreferences, enabled: true })
  );
  await renderHook();
  await act(async () => current?.actions.start());
  expect(client.start).toHaveBeenCalledOnce();
});
