// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';

const mocks = vi.hoisted(() => ({
  loadVideoSettings: vi.fn(),
  saveVideoSettings: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  loadVideoSettings: mocks.loadVideoSettings,
  saveVideoSettings: mocks.saveVideoSettings,
}));

vi.mock('../../runtime/messaging', () => ({
  settingsRuntimeMessagingTransport: { sendRuntimeMessage: mocks.sendRuntimeMessage },
}));

import { NativeAppSection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.loadVideoSettings.mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
  mocks.saveVideoSettings.mockResolvedValue(undefined);
  mocks.sendRuntimeMessage.mockResolvedValue({
    settings: DEFAULT_VIDEO_SETTINGS.native,
    status: createStatus(),
    success: true,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderSection() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<NativeAppSection />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function changeNumber(input: HTMLInputElement | undefined, value: string): void {
  if (!input) {
    return;
  }
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

it('renders native app status and saves changed native settings', async () => {
  await renderSection();

  expect(container?.textContent).toContain('Другой профиль');
  expect(container?.textContent).toContain('Сейчас управляется');
  expect(container?.textContent).toContain('Не удалось выполнить действие приложения Sniptale.');
  expect(container?.textContent).toContain('Некоторые возможности приложения сейчас недоступны.');
  expect(container?.textContent).not.toContain('Needs attention');
  expect(container?.textContent).toContain('Windows 11');
  expect(container?.textContent).toContain('Программное');
  expect(container?.textContent).not.toContain('force-software');
  expect(container?.textContent).toContain('3840x2160');
  expect(container?.textContent).not.toContain('Сохранено');

  const switches = [
    ...(container?.querySelectorAll<HTMLButtonElement>('button[role="switch"]') ?? []),
  ];
  await act(async () => {
    switches[0]?.click();
  });
  const numbers = [
    ...(container?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? []),
  ];
  await act(async () => {
    changeNumber(numbers[0], '12');
    changeNumber(numbers[0], '');
    changeNumber(numbers[1], '120');
    for (const toggle of switches.slice(1).filter((item) => !item.disabled)) {
      toggle.click();
    }
  });
  expect(mocks.saveVideoSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      native: expect.objectContaining({ screenshots: { includeCursor: false } }),
    })
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'sync-settings' })
  );
});

it('sends native runtime actions from the status panel', async () => {
  await renderSection();

  const button = container?.querySelector('button');
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'reconnect' })
  );
});

it('passes runtime capabilities into native app settings controls', async () => {
  await renderSection();

  const regionRecording = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Запись области: Горячая клавиша"]'
  );

  expect(regionRecording?.disabled).toBe(true);
  expect(container?.textContent).toContain('Недоступно в подключенном приложении');
});

it('keeps settings controls available before native capabilities are known', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({
    settings: DEFAULT_VIDEO_SETTINGS.native,
    status: createStatus({ capabilities: null }),
    success: true,
  });

  await renderSection();

  const regionRecording = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Запись области: Горячая клавиша"]'
  );

  expect(regionRecording?.disabled).toBe(false);
});

it('shows a translated load error when native state loading fails', async () => {
  mocks.loadVideoSettings.mockRejectedValueOnce(new Error('load failed'));

  await renderSection();

  expect(container?.textContent).toContain('Не удалось загрузить состояние приложения Sniptale.');
  expect(container?.textContent).not.toContain('load failed');
});

it('normalizes stale background runtime errors into user-facing copy', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({
    error: 'Unknown message type',
    success: false,
  });

  await renderSection();

  expect(container?.textContent).toContain('Фоновая часть расширения ещё не обновилась.');
  expect(container?.textContent).not.toContain('Unknown message type');
});

it('normalizes native host status errors into user-facing copy', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({
    settings: DEFAULT_VIDEO_SETTINGS.native,
    status: createStatus({
      connectionState: 'missing-host',
      error: {
        code: 'unknown',
        message: 'Specified native messaging host not found.',
        recoverable: true,
      },
    }),
    success: true,
  });

  await renderSection();

  expect(container?.textContent).toMatch(/Нет подключения[\s\S]*Приложение Sniptale не найдено/);
  expect(container?.textContent).not.toContain('Specified native messaging host not found.');
  expect(container?.textContent).not.toContain('Host не найден');
});

function createStatus(patch: Partial<NativeAppRuntimeStatus> = {}): NativeAppRuntimeStatus {
  return {
    appStatus: null,
    connectionState: 'controlled-by-other-profile',
    controllerLease: null,
    capabilities: createCapabilities(),
    effectiveSettings: createEffectiveSettings(),
    error: { code: 'unknown', message: 'Needs attention', recoverable: true },
    hostName: 'com.sniptale.native_host',
    install: createInstall(),
    lastHeartbeatAt: null,
    lastOperationError: null,
    platform: { arch: 'x64', kind: 'windows', version: '11' },
    settingsRevision: null,
    trayActions: null,
    warnings: [{ code: 'unsupported-capability', field: 'storage', message: 'Needs attention' }],
    ...patch,
  };
}

function createCapabilities(): NativeAppRuntimeStatus['capabilities'] {
  return {
    audio: {
      microphoneDevices: [],
      supportsMicrophone: true,
      supportsMixedAudio: true,
      supportsSystemAudio: true,
      unavailableReasons: [],
    },
    capture: {
      screenshotModes: ['screen'],
      supportsFreezeRegionSelection: true,
      videoModes: ['screen'],
    },
    codecs: {
      audio: ['aac'],
      containers: ['mp4'],
      hardwareEncoderAvailable: true,
      unavailableReasons: [],
      video: ['h264'],
    },
    limits: {
      maxChunkBytes: 524_288,
      maxFps: 60,
      maxHeight: 2160,
      maxRecordingBytes: 1_000_000,
      maxScreenshotBytes: 100_000,
      maxWidth: 3840,
    },
  };
}

function createEffectiveSettings(): NativeAppRuntimeStatus['effectiveSettings'] {
  const native = DEFAULT_VIDEO_SETTINGS.native as NonNullable<typeof DEFAULT_VIDEO_SETTINGS.native>;
  return {
    ...native,
    video: {
      ...native.video,
      codec: { ...native.video.codec, hardwareAcceleration: 'force-software' },
    },
    warnings: [],
  };
}

function createInstall(): NativeAppRuntimeStatus['install'] {
  return {
    appCacheSchemaVersion: 1,
    appVersion: '0.1.0',
    autostart: { enabled: true, method: 'windows-hkcu-run', supported: true },
    installerVersion: '0.1.0',
    nativeHostManifestVersion: '0.1.0',
    packageIntegrity: 'valid',
    platform: { arch: 'x64', kind: 'windows', version: '11' },
    rollbackProtected: true,
    signedBinary: true,
    updateChannel: 'stable',
  };
}
