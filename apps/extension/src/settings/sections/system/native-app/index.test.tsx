// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NativeAppRuntimeStatus } from '../../../../contracts/native-app/runtime';
import { NativeAppSection } from '.';

const mocks = vi.hoisted(() => ({ contains: vi.fn(), request: vi.fn(), send: vi.fn() }));
vi.mock('@sniptale/platform/browser/permissions', () => ({
  browserPermissions: {
    contains: mocks.contains,
    request: mocks.request,
    subscribeToAdded: () => vi.fn(),
    subscribeToRemoved: () => vi.fn(),
  },
}));
vi.mock('../../../runtime/messaging', () => ({
  settingsRuntimeMessagingTransport: { sendRuntimeMessage: mocks.send },
}));
let root: Root;
let container: HTMLDivElement;
function status(
  connectionState: NativeAppRuntimeStatus['connectionState'] = 'connected'
): NativeAppRuntimeStatus {
  return {
    appIdentity: { clientId: 'a'.repeat(64), trustVersion: 1 },
    appStatus: null,
    capabilities: null,
    connectionState,
    controllerLease: null,
    effectiveSettings: null,
    error: null,
    hostName: 'com.sniptale.native_host',
    install: null,
    lastHeartbeatAt: null,
    lastOperationError: null,
    platform: null,
    settingsRevision: null,
    trayActions: null,
    warnings: [],
  };
}
function response(state: NativeAppRuntimeStatus['connectionState']) {
  return { success: true, status: status(state) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.contains.mockResolvedValue(true);
  mocks.request.mockResolvedValue(true);
  mocks.send.mockResolvedValue(response('connected'));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function render(view = 'connection') {
  await act(async () => {
    root.render(<NativeAppSection view={view} />);
  });
}
function button(label: string) {
  return [...container.querySelectorAll('button')].find((node) =>
    node.textContent?.includes(label)
  );
}
async function click(label: string) {
  const target = button(label);
  expect(target).toBeDefined();
  await act(async () => {
    target?.click();
  });
}

it('exposes connection only and explains Desktop ownership for retired deep links', async () => {
  await render('capture');
  expect(container.querySelector('[role="tab"]')).toBeNull();
  expect(container.querySelector('[role="switch"]')).toBeNull();
  expect(container.querySelector('input')).toBeNull();
  expect(button('Применить настройки')).toBeUndefined();
  expect(button('Сделать этот браузер активным')).toBeUndefined();
  expect(container.textContent).toContain('настраиваются в Desktop');
  expect(button('Проверить подключение')).toBeDefined();
});

it('binds explicit consent to the displayed Desktop installation identity', async () => {
  mocks.send.mockResolvedValue(response('trust-required'));
  await render();
  expect(container.textContent).toContain('a'.repeat(64));
  await click('Доверять приложению');
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'trust-client', clientId: 'a'.repeat(64) })
  );
});

it('permits explicit revocation without exposing Desktop settings', async () => {
  await render();
  await click('Отозвать доверие');
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ operation: 'forget-client' }));
});

it('requires optional native access before connection actions', async () => {
  mocks.contains.mockResolvedValue(false);
  await render();
  expect(button('Проверить подключение')).toBeUndefined();
  await click('Разрешить доступ');
  expect(mocks.request).toHaveBeenCalledWith({ permissions: ['nativeMessaging'] });
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ operation: 'reconnect' }));
});

it('keeps connection actions hidden until the initial permission query settles', async () => {
  const permission = deferred<boolean>();
  mocks.contains.mockReturnValue(permission.promise);
  await render();
  expect(button('Проверить подключение')).toBeUndefined();
  await act(async () => {
    permission.resolve(true);
  });
  expect(button('Проверить подключение')).toBeDefined();
});

it('shows connection deadline feedback and the recovery action', async () => {
  mocks.send.mockResolvedValue({
    success: true,
    status: {
      ...status('error'),
      error: { code: 'unknown', message: 'Native app handshake timed out', recoverable: true },
    },
  });
  await render();
  expect(container.textContent).toContain('Desktop не ответил');
  expect(button('Проверить подключение')).toBeDefined();
});

it('observes connection changes while Settings stays open', async () => {
  vi.useFakeTimers();
  await render();
  mocks.send.mockResolvedValue(response('missing-host'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(container.textContent).toContain('Нет подключения');
});

it('does not apply an older status observation after a newer action', async () => {
  vi.useFakeTimers();
  await render();
  const pending = deferred<ReturnType<typeof response>>();
  mocks.send.mockReturnValueOnce(pending.promise);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  mocks.send.mockResolvedValueOnce(response('missing-host'));
  await click('Проверить подключение');
  await act(async () => {
    pending.resolve(response('connected'));
  });
  expect(container.textContent).toContain('Нет подключения');
});

it('does not apply an older action failure after a newer action', async () => {
  await render();
  const pending = deferred<ReturnType<typeof response>>();
  mocks.send.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response('missing-host'));
  await click('Проверить подключение');
  await click('Проверить подключение');
  await act(async () => {
    pending.reject(new Error('stale failure'));
  });
  expect(container.textContent).toContain('Нет подключения');
  expect(container.textContent).not.toContain('Не удалось выполнить действие');
});

it('shows a translated error after a current action failure', async () => {
  vi.useFakeTimers();
  await render();
  mocks.send.mockRejectedValueOnce(new Error('failed'));
  await click('Проверить подключение');
  expect(container.textContent).toContain('Не удалось выполнить действие приложения Sniptale.');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(container.textContent).toContain('Не удалось выполнить действие приложения Sniptale.');
});

it('keeps the connection permission gate after explicit denial', async () => {
  mocks.contains.mockResolvedValue(false);
  mocks.request.mockResolvedValue(false);
  await render();
  await click('Разрешить доступ');
  expect(button('Проверить подключение')).toBeUndefined();
  expect(container.textContent).toContain('Доступ к приложению Sniptale не был разрешён.');
});

it('shows a recoverable initial load error when the runtime query fails', async () => {
  mocks.send.mockRejectedValueOnce(new Error('runtime unavailable'));
  await render();
  expect(container.textContent).toContain('Не удалось загрузить состояние приложения Sniptale.');
});

it('preserves the last status when a status observation has no snapshot', async () => {
  vi.useFakeTimers();
  mocks.send.mockResolvedValueOnce(response('missing-host'));
  await render();
  mocks.send.mockResolvedValueOnce({ success: true });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(container.textContent).toContain('Нет подключения');
});

it('does not overlap status observations while the runtime is slow', async () => {
  vi.useFakeTimers();
  await render();
  const pending = deferred<ReturnType<typeof response>>();
  mocks.send.mockReturnValueOnce(pending.promise);
  const count = mocks.send.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(mocks.send).toHaveBeenCalledTimes(count + 1);
  await act(async () => {
    pending.resolve(response('connected'));
  });
});

it('does not query native status while optional access is absent', async () => {
  vi.useFakeTimers();
  mocks.contains.mockResolvedValue(false);
  await render();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(mocks.send).not.toHaveBeenCalled();
});

it('shows status observation failures and recovers on the next observation', async () => {
  vi.useFakeTimers();
  await render();
  mocks.send.mockResolvedValueOnce({ success: false, error: 'runtime query failed' });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(container.textContent).toContain('Не удалось выполнить действие приложения Sniptale.');
  mocks.send.mockRejectedValueOnce(new Error('port unavailable'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(button('Проверить подключение')).toBeDefined();
});

it('checks a disconnected host without a previously observed installation identity', async () => {
  mocks.send.mockResolvedValue({
    success: true,
    status: { ...status('missing-host'), appIdentity: null },
  });
  await render();
  await click('Проверить подключение');
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ operation: 'reconnect' }));
});
