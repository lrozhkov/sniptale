// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type {
  VoiceInputLocalAvailability,
  VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputSettingsError } from './controller-contract';

const mocks = vi.hoisted(() => ({ install: vi.fn() }));

vi.mock('@sniptale/platform/browser/speech-recognition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/speech-recognition')>()),
  installSpeechRecognitionLanguage: mocks.install,
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn() }),
}));

import { useLocalVoiceInstallation } from './use-local-voice-installation';

type Installation = ReturnType<typeof useLocalVoiceInstallation>;

const initialSnapshot: VoiceInputSnapshot = {
  apiFlavor: 'standard',
  busyOwner: null,
  effectiveMode: null,
  errorCode: null,
  fallbackReason: null,
  language: 'ru-RU',
  localAvailability: 'downloadable',
  phase: 'idle',
  quality: 'dictation',
  qualitySupported: true,
  requestedMode: 'local-first',
  sessionId: null,
};

let container: HTMLDivElement;
let current: {
  error: VoiceInputSettingsError;
  installation: Installation;
  snapshot: VoiceInputSnapshot;
} | null;
let refreshAvailability: Mock<() => Promise<VoiceInputLocalAvailability>>;
let root: Root;

function Harness() {
  const [error, setError] = useState<VoiceInputSettingsError>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const installation = useLocalVoiceInstallation({
    language: 'ru-RU',
    refreshAvailability,
    setError,
    setSnapshot,
  });
  current = { error, installation, snapshot };
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.install.mockResolvedValue(true);
  refreshAvailability = vi.fn().mockResolvedValue('available');
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

describe('local voice package installation', () => {
  it('installs from the direct click path and verifies dictation availability', async () => {
    await act(async () => current?.installation.installPackage());
    expect(mocks.install).toHaveBeenCalledWith('ru-RU');
    expect(refreshAvailability).toHaveBeenCalledOnce();
    expect(current?.error).toBeNull();
    expect(current?.installation.installing).toBe(false);
    expect(current?.snapshot.phase).toBe('idle');
  });

  it('surfaces false, unavailable, and rejected install outcomes', async () => {
    mocks.install.mockResolvedValueOnce(false);
    refreshAvailability.mockResolvedValueOnce('unavailable');
    await act(async () => current?.installation.installPackage());
    expect(current?.error).toBe('install');

    mocks.install.mockRejectedValueOnce(new Error('private install detail'));
    await act(async () => current?.installation.installPackage());
    expect(current?.error).toBe('install');
  });

  it('polls an already-downloading package and ignores non-actionable states', async () => {
    vi.useFakeTimers();
    refreshAvailability.mockResolvedValueOnce('downloading').mockResolvedValueOnce('available');
    let pending: Promise<void> | undefined;
    act(() => {
      pending = current?.installation.ensureLocalPackage('downloading');
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await act(async () => pending);
    expect(refreshAvailability).toHaveBeenCalledTimes(2);
    expect(current?.error).toBeNull();

    await act(async () => current?.installation.ensureLocalPackage('available'));
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it('invalidates an in-flight completion after preferences change', async () => {
    let resolveInstall: ((installed: boolean) => void) | undefined;
    mocks.install.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveInstall = resolve;
      })
    );
    let pending: Promise<void> | undefined;
    act(() => {
      pending = current?.installation.installPackage();
    });
    act(() => current?.installation.invalidateInstallation());
    resolveInstall?.(true);
    await act(async () => pending);
    expect(refreshAvailability).not.toHaveBeenCalled();
    expect(current?.installation.installing).toBe(false);
  });
});
