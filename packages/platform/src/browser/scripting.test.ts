import { afterEach, expect, it, vi } from 'vitest';

import { browserScripting } from './scripting';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

it('delegates script injection to chrome.scripting.executeScript', async () => {
  const executeScript = vi.fn().mockResolvedValue([{ frameId: 0, result: 'ok' }]);
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      scripting: {
        executeScript,
        getRegisteredContentScripts: vi.fn(),
        registerContentScripts: vi.fn(),
        unregisterContentScripts: vi.fn(),
      },
    },
    writable: true,
  });

  const injection = {
    func: () => 'ok',
    target: {
      tabId: 7,
    },
  } satisfies chrome.scripting.ScriptInjection<[], string>;

  await expect(browserScripting.executeScript(injection)).resolves.toEqual([
    {
      frameId: 0,
      result: 'ok',
    },
  ]);
  expect(executeScript).toHaveBeenCalledWith(injection);
});

it('delegates dynamic content script registry operations', async () => {
  const registered = [{ id: 'script-1' }];
  const getRegisteredContentScripts = vi.fn().mockResolvedValue(registered);
  const registerContentScripts = vi.fn().mockResolvedValue(undefined);
  const unregisterContentScripts = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      scripting: {
        executeScript: vi.fn(),
        getRegisteredContentScripts,
        registerContentScripts,
        unregisterContentScripts,
      },
    },
    writable: true,
  });

  const filter = { ids: ['script-1'] };
  const scripts = [{ id: 'script-1', js: ['content.js'], matches: ['https://*/*'] }];

  await expect(browserScripting.getRegisteredContentScripts(filter)).resolves.toBe(registered);
  await expect(browserScripting.getRegisteredContentScripts()).resolves.toBe(registered);
  await expect(
    browserScripting.registerContentScripts(scripts as chrome.scripting.RegisteredContentScript[])
  ).resolves.toBeUndefined();
  await expect(browserScripting.unregisterContentScripts(filter)).resolves.toBeUndefined();
  await expect(browserScripting.unregisterContentScripts()).resolves.toBeUndefined();

  expect(getRegisteredContentScripts).toHaveBeenCalledWith(filter);
  expect(getRegisteredContentScripts).toHaveBeenCalledWith();
  expect(registerContentScripts).toHaveBeenCalledWith(scripts);
  expect(unregisterContentScripts).toHaveBeenCalledWith(filter);
  expect(unregisterContentScripts).toHaveBeenCalledWith();
});
