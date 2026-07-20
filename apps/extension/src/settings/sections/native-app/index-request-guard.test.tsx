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

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

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
    status: createStatus('connected'),
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

it('does not let an older settings save success overwrite a newer action result', async () => {
  const save = createDeferred<void>();
  mocks.saveVideoSettings.mockReturnValueOnce(save.promise);
  await renderSection();
  mocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      settings: DEFAULT_VIDEO_SETTINGS.native,
      status: createStatus('missing-host'),
      success: true,
    })
    .mockResolvedValueOnce({
      settings: DEFAULT_VIDEO_SETTINGS.native,
      status: createStatus('connected'),
      success: true,
    });

  await clickFirstNativeSettingSwitch();
  await clickSyncSettings();
  await act(async () => {
    save.resolve(undefined);
    await Promise.resolve();
  });

  expect(hasExactText('span', 'Нет подключения')).toBe(true);
  expect(hasExactText('span', 'Подключено')).toBe(false);
});

it('does not let an older settings save failure overwrite a newer action result', async () => {
  const save = createDeferred<void>();
  mocks.saveVideoSettings.mockReturnValueOnce(save.promise);
  await renderSection();
  mocks.sendRuntimeMessage.mockResolvedValueOnce({
    settings: DEFAULT_VIDEO_SETTINGS.native,
    status: createStatus('missing-host'),
    success: true,
  });

  await clickFirstNativeSettingSwitch();
  await clickSyncSettings();
  await act(async () => {
    save.reject(new Error('save failed'));
    await Promise.resolve();
  });

  expect(hasExactText('span', 'Нет подключения')).toBe(true);
  expect(container?.textContent).not.toContain(
    'Не удалось выполнить действие приложения Sniptale.'
  );
});

it('does not let an older runtime action failure overwrite a newer action result', async () => {
  const staleAction = createDeferred<never>();
  await renderSection();
  mocks.sendRuntimeMessage.mockReturnValueOnce(staleAction.promise).mockResolvedValueOnce({
    status: createStatus('missing-host'),
    success: true,
  });

  await clickReconnect();
  await clickSyncSettings();
  await act(async () => {
    staleAction.reject(new Error('action failed'));
    await Promise.resolve();
  });

  expect(hasExactText('span', 'Нет подключения')).toBe(true);
  expect(container?.textContent).not.toContain(
    'Не удалось выполнить действие приложения Sniptale.'
  );
});

it('shows the translated action error when the current runtime action fails', async () => {
  await renderSection();
  mocks.sendRuntimeMessage.mockRejectedValueOnce(new Error('action failed'));

  await clickSyncSettings();

  expect(container?.textContent).toContain('Не удалось выполнить действие приложения Sniptale.');
});

async function clickFirstNativeSettingSwitch(): Promise<void> {
  const switchButton = container?.querySelector<HTMLButtonElement>('button[role="switch"]');
  await act(async () => {
    switchButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

async function clickReconnect(): Promise<void> {
  const buttons = [...(container?.querySelectorAll('button') ?? [])];
  await act(async () => {
    buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

async function clickSyncSettings(): Promise<void> {
  const buttons = [...(container?.querySelectorAll('button') ?? [])];
  await act(async () => {
    buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

function hasExactText(selector: string, text: string): boolean {
  return [...(container?.querySelectorAll(selector) ?? [])].some(
    (element) => element.textContent === text
  );
}

function createStatus(
  connectionState: NativeAppRuntimeStatus['connectionState']
): NativeAppRuntimeStatus {
  return {
    appStatus: null,
    capabilities: null,
    connectionState,
    controllerLease: null,
    effectiveSettings: null,
    error: null,
    hostName: 'com.sniptale.native_host',
    install: {
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
    },
    lastHeartbeatAt: null,
    lastOperationError: null,
    platform: null,
    settingsRevision: null,
    trayActions: null,
    warnings: [],
  };
}
