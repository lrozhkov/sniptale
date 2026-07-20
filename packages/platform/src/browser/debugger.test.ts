import { afterEach, expect, it, vi } from 'vitest';

import { browserDebugger } from './debugger';

function installChromeDebuggerStub() {
  const onEvent = { addListener: vi.fn(), removeListener: vi.fn() };
  const onDetach = { addListener: vi.fn(), removeListener: vi.fn() };
  const chromeStub = {
    debugger: {
      attach: vi.fn((_target, _version, callback) => callback()),
      detach: vi.fn((_target, callback) => callback()),
      getTargets: vi.fn(async () => [{ id: 'target-1' }]),
      onDetach,
      onEvent,
      sendCommand: vi.fn(async () => ({ ok: true })),
    },
    runtime: { lastError: undefined as { message: string } | undefined },
  };

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: chromeStub,
    writable: true,
  });

  return { chromeStub, onDetach, onEvent };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

it('attaches, detaches, sends commands, and subscribes to debugger events', async () => {
  const { chromeStub, onDetach, onEvent } = installChromeDebuggerStub();
  const listener = vi.fn();
  const detachListener = vi.fn();

  await expect(browserDebugger.attach({ tabId: 1 }, '1.3')).resolves.toBeUndefined();
  await expect(browserDebugger.detach({ tabId: 1 })).resolves.toBeUndefined();
  await expect(browserDebugger.getTargets()).resolves.toEqual([{ id: 'target-1' }]);
  await expect(
    browserDebugger.sendCommand<{ ok: boolean }>({ tabId: 1 }, 'Page.enable', { enabled: true })
  ).resolves.toEqual({ ok: true });

  const unsubscribeEvent = browserDebugger.subscribeToEvent(listener as never);
  const unsubscribeDetach = browserDebugger.subscribeToDetach(detachListener as never);

  expect(chromeStub.debugger.attach).toHaveBeenCalledWith(
    { tabId: 1 },
    '1.3',
    expect.any(Function)
  );
  expect(chromeStub.debugger.detach).toHaveBeenCalledWith({ tabId: 1 }, expect.any(Function));
  expect(chromeStub.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 1 }, 'Page.enable', {
    enabled: true,
  });
  expect(onEvent.addListener).toHaveBeenCalledWith(listener);
  expect(onDetach.addListener).toHaveBeenCalledWith(detachListener);

  unsubscribeEvent();
  unsubscribeDetach();

  expect(onEvent.removeListener).toHaveBeenCalledWith(listener);
  expect(onDetach.removeListener).toHaveBeenCalledWith(detachListener);
});

it('rejects debugger attach when chrome.debugger is unavailable', async () => {
  await expect(browserDebugger.attach({ tabId: 1 }, '1.3')).rejects.toThrow(
    'chrome.debugger is unavailable'
  );
});
