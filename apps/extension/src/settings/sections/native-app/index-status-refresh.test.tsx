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
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
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
  vi.useRealTimers();
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

it('refreshes transient reconnect status from the current runtime query', async () => {
  await renderSection();
  vi.useFakeTimers();
  mocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      settings: DEFAULT_VIDEO_SETTINGS.native,
      status: createStatus('connecting'),
      success: true,
    })
    .mockResolvedValueOnce({
      settings: DEFAULT_VIDEO_SETTINGS.native,
      status: createStatus('connected'),
      success: true,
    });

  const reconnect = container?.querySelector('button');
  await act(async () => {
    reconnect?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });

  const queryMessages = mocks.sendRuntimeMessage.mock.calls.filter(
    ([message]) =>
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'NATIVE_APP_QUERY'
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'reconnect' })
  );
  expect(queryMessages).toHaveLength(2);
  expect(hasExactText('span', 'Подключено')).toBe(true);
  expect(hasExactText('span', 'Подключение')).toBe(false);
});

it('does not let an older reconnect poll overwrite a newer action result', async () => {
  await renderSection();
  vi.useFakeTimers();
  mocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      settings: DEFAULT_VIDEO_SETTINGS.native,
      status: createStatus('connecting'),
      success: true,
    })
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

  const buttons = [...(container?.querySelectorAll('button') ?? [])];
  await act(async () => {
    buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(1_000);
    await Promise.resolve();
  });

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'reconnect' })
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'sync-settings' })
  );
  expect(hasExactText('span', 'Нет подключения')).toBe(true);
  expect(hasExactText('span', 'Подключено')).toBe(false);
});

it('does not let the initial load overwrite a newer action result', async () => {
  const initialLoad = createDeferred<typeof DEFAULT_VIDEO_SETTINGS>();
  mocks.loadVideoSettings.mockReturnValueOnce(initialLoad.promise);
  mocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      settings: DEFAULT_VIDEO_SETTINGS.native,
      status: createStatus('connected'),
      success: true,
    })
    .mockResolvedValueOnce({
      settings: DEFAULT_VIDEO_SETTINGS.native,
      status: createStatus('missing-host'),
      success: true,
    });

  await renderSection();
  const buttons = [...(container?.querySelectorAll('button') ?? [])];
  await act(async () => {
    buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    initialLoad.resolve(DEFAULT_VIDEO_SETTINGS);
    await Promise.resolve();
  });

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'sync-settings' })
  );
  expect(hasExactText('span', 'Нет подключения')).toBe(true);
  expect(hasExactText('span', 'Подключено')).toBe(false);
});

it('does not let an initial load failure overwrite a newer action result', async () => {
  const initialLoad = createDeferred<typeof DEFAULT_VIDEO_SETTINGS>();
  mocks.loadVideoSettings.mockReturnValueOnce(initialLoad.promise);
  mocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      settings: DEFAULT_VIDEO_SETTINGS.native,
      status: createStatus('connected'),
      success: true,
    })
    .mockResolvedValueOnce({
      settings: DEFAULT_VIDEO_SETTINGS.native,
      status: createStatus('missing-host'),
      success: true,
    });

  await renderSection();
  const buttons = [...(container?.querySelectorAll('button') ?? [])];
  await act(async () => {
    buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    initialLoad.reject(new Error('load failed'));
    await Promise.resolve();
  });

  expect(hasExactText('span', 'Нет подключения')).toBe(true);
  expect(container?.textContent).not.toContain(
    'Не удалось загрузить состояние приложения Sniptale.'
  );
});

it('shows the translated initial load error when the current load fails', async () => {
  mocks.loadVideoSettings.mockRejectedValueOnce(new Error('load failed'));

  await renderSection();

  expect(container?.textContent).toContain('Не удалось загрузить состояние приложения Sniptale.');
});

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
