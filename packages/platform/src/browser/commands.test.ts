import { beforeEach, expect, it, vi } from 'vitest';

import { browserCommands, type BrowserCommandListener } from './commands';

const listeners = new Set<BrowserCommandListener>();

function installChromeCommandsStub(chromeStub: unknown): void {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: chromeStub,
  });
}

beforeEach(() => {
  listeners.clear();
  installChromeCommandsStub({
    commands: {
      onCommand: {
        addListener: (listener: BrowserCommandListener) => listeners.add(listener),
        removeListener: (listener: BrowserCommandListener) => listeners.delete(listener),
      },
    },
  });
});

it('subscribes to extension commands and removes the exact listener', () => {
  const listener = vi.fn();
  const unsubscribe = browserCommands.subscribeToCommand(listener);

  expect(browserCommands.isAvailable()).toBe(true);
  expect(listeners).toContain(listener);

  unsubscribe();
  expect(listeners).not.toContain(listener);
});

it('fails closed when the commands API is unavailable', () => {
  installChromeCommandsStub({});
  const listener = vi.fn();

  expect(browserCommands.isAvailable()).toBe(false);
  expect(browserCommands.subscribeToCommand(listener)).toEqual(expect.any(Function));
  expect(listener).not.toHaveBeenCalled();
});
