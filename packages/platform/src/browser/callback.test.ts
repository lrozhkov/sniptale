import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runChromeCallback, runChromeVoidCallback, subscribeToChromeEvent } from './callback';

type Listener = (...args: unknown[]) => void;

function createChromeStub() {
  return {
    runtime: {
      lastError: undefined as { message?: string } | undefined,
    },
  };
}

function installChromeStub(chromeStub: ReturnType<typeof createChromeStub>) {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: chromeStub,
    writable: true,
  });
}

function resetBrowserCallbackGlobals() {
  Reflect.deleteProperty(globalThis, 'chrome');
}

async function verifyUnavailableCallbackFailure() {
  await expect(
    runChromeCallback<string>(() => undefined, 'chrome.runtime is unavailable')
  ).rejects.toThrow('chrome.runtime is unavailable');
}

async function verifyCallbackResolutionAndLastErrorHandling() {
  const chromeStub = createChromeStub();
  installChromeStub(chromeStub);

  await expect(
    runChromeCallback<string>((callback) => {
      callback('ok');
    }, 'chrome.runtime is unavailable')
  ).resolves.toBe('ok');

  chromeStub.runtime.lastError = { message: 'callback failed' };

  await expect(
    runChromeCallback<string>((callback) => {
      callback('ignored');
    }, 'chrome.runtime is unavailable')
  ).rejects.toThrow('callback failed');

  chromeStub.runtime.lastError = {};

  await expect(
    runChromeCallback<string>((callback) => {
      callback('ignored');
    }, 'chrome.runtime is unavailable')
  ).rejects.toThrow('Chrome runtime error');
}

async function verifyPromiseLikeAndThrownRegisterBranches() {
  installChromeStub(createChromeStub());

  await expect(
    runChromeCallback<string>(
      () => Promise.resolve('async-result'),
      'chrome.runtime is unavailable'
    )
  ).resolves.toBe('async-result');

  await expect(
    runChromeCallback<string>(() => {
      throw new Error('register failed');
    }, 'chrome.runtime is unavailable')
  ).rejects.toThrow('register failed');
}

async function verifyVoidWrapperAndDeterministicUnsubscribe() {
  installChromeStub(createChromeStub());
  const addListener = vi.fn();
  const removeListener = vi.fn();
  const listener = vi.fn();

  await expect(
    runChromeVoidCallback((callback) => {
      callback();
    }, 'chrome.runtime is unavailable')
  ).resolves.toBeUndefined();

  const unsubscribe = subscribeToChromeEvent({ addListener, removeListener }, listener as Listener);

  expect(addListener).toHaveBeenCalledWith(listener);

  unsubscribe();

  expect(removeListener).toHaveBeenCalledWith(listener);
  expect(subscribeToChromeEvent(undefined, listener as Listener)).toEqual(expect.any(Function));
}

describe('browser-callback', () => {
  beforeEach(resetBrowserCallbackGlobals);
  afterEach(resetBrowserCallbackGlobals);

  it('rejects when chrome is unavailable', verifyUnavailableCallbackFailure);
  it(
    'resolves successful callbacks and rejects when runtime.lastError is set',
    verifyCallbackResolutionAndLastErrorHandling
  );
  it(
    'supports promise-returning registers and thrown register errors',
    verifyPromiseLikeAndThrownRegisterBranches
  );
  it(
    'wraps void callbacks and returns a deterministic unsubscribe handle',
    verifyVoidWrapperAndDeterministicUnsubscribe
  );
});
