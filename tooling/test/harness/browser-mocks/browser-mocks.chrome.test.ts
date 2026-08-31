// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it } from 'vitest';

import { createChromeMock, ensureMediaDevices } from './browser-mocks.chrome';
import { ChromeEvent } from './browser-mocks.shared';
import { createHarnessApiBehavior } from './browser-mocks.types';

function createBehaviorRef() {
  let behavior = createHarnessApiBehavior();

  return {
    get: () => behavior,
    set: (overrides: Parameters<typeof createHarnessApiBehavior>[0]) => {
      behavior = createHarnessApiBehavior(overrides, behavior);
    },
  };
}

function createChromeHarnessMock() {
  const runtimeOnMessage = new ChromeEvent<[unknown, unknown?, ((response?: unknown) => void)?]>();
  const tabsOnActivated = new ChromeEvent<[unknown]>();
  const tabsOnUpdated = new ChromeEvent<[number, unknown, unknown]>();
  const permissionsOnAdded = new ChromeEvent<[unknown]>();
  const permissionsOnRemoved = new ChromeEvent<[unknown]>();
  const behaviorRef = createBehaviorRef();

  const chromeMock = createChromeMock({
    runtimeOnMessage,
    tabsOnActivated,
    tabsOnUpdated,
    permissionsOnAdded,
    permissionsOnRemoved,
    controller: {
      getActiveTab: () => ({
        id: 1,
        active: true,
        title: 'Harness tab',
        url: 'https://example.com/',
        windowId: 1,
      }),
      handleRuntimeSendMessage: async (message) => message,
      handleTabCreate: async (createProperties) =>
        ({ id: 2, url: createProperties.url ?? '' }) as chrome.tabs.Tab,
    },
    getBehavior: behaviorRef.get,
  });

  return {
    behaviorRef,
    chromeMock,
  };
}

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {},
  });
});

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: undefined,
  });
});

it('fails closed by default for tab messaging, permissions, and microphone access', async () => {
  const { chromeMock } = createChromeHarnessMock();

  await expect(chromeMock.tabs.sendMessage(7, { type: 'PING' })).rejects.toThrow(
    'No harness tab response configured'
  );
  await expect(chromeMock.permissions.contains({ permissions: ['downloads'] })).resolves.toBe(
    false
  );
  await expect(chromeMock.permissions.request({ permissions: ['downloads'] })).resolves.toBe(false);

  ensureMediaDevices();
  await expect(navigator.mediaDevices.getUserMedia({ audio: true })).rejects.toMatchObject({
    name: 'NotAllowedError',
  });
});

it('supports explicit success opt-in for harness browser APIs', async () => {
  const { behaviorRef, chromeMock } = createChromeHarnessMock();
  behaviorRef.set({
    tabSendMessage: 'success',
    permissions: {
      contains: true,
      request: true,
    },
    mediaDevices: {
      getUserMedia: 'success',
    },
  });

  await expect(chromeMock.tabs.sendMessage(7, { type: 'PING' })).resolves.toEqual({
    success: true,
  });
  await expect(chromeMock.permissions.contains({ permissions: ['downloads'] })).resolves.toBe(true);
  await expect(chromeMock.permissions.request({ permissions: ['downloads'] })).resolves.toBe(true);

  ensureMediaDevices(behaviorRef.get);
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  expect(stream.getTracks()).toHaveLength(1);
});
