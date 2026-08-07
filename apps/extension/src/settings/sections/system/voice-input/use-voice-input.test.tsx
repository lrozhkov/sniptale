// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceInputServerEvent } from '@sniptale/runtime-contracts/voice-input';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';

const mocks = vi.hoisted(() => ({
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

vi.mock('../../../runtime/store/useSettingsStore', () => ({
  createSettingsStore: vi.fn(),
  useSettingsStore: () => ({
    settings: {
      voiceInput: { language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' },
    },
    updateSettings: mocks.updateSettings,
  }),
}));

import type { VoiceInputSettingsController } from './controller-contract';
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
      language: 'ru-RU',
      microphoneDeviceId: null,
      mode: 'local-first',
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
    expect(client.stop).toHaveBeenCalledWith('session-1');
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
