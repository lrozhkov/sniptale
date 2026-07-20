// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import { browserRuntime } from '@sniptale/platform/browser/runtime';
import type { SniptaleHarnessBootstrap } from './browser-mocks.types';

function resetHarnessGlobals() {
  Reflect.deleteProperty(window, '__sniptaleHarness');
  Reflect.deleteProperty(window, '__sniptaleHarnessBootstrap');
  Reflect.deleteProperty(window, 'chrome');

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: undefined,
  });
}

async function loadHarness(bootstrap?: SniptaleHarnessBootstrap) {
  vi.resetModules();
  resetHarnessGlobals();
  vi.doMock('./browser-mocks.media-library', () => ({
    clearHarnessMediaLibrary: vi.fn(async () => undefined),
    listHarnessMediaLibraryAssets: vi.fn(async () => []),
    seedHarnessMediaLibrary: vi.fn(async () => undefined),
    seedHarnessMediaState: vi.fn(async () => undefined),
    seedHarnessVideoProjects: vi.fn(async () => undefined),
  }));
  if (bootstrap === undefined) {
    Reflect.deleteProperty(window, '__sniptaleHarnessBootstrap');
  } else {
    window.__sniptaleHarnessBootstrap = bootstrap;
  }

  const harnessModule = await import('./browser-mocks');
  await harnessModule.harnessReady;
  return harnessModule;
}

afterEach(() => {
  vi.restoreAllMocks();
  resetHarnessGlobals();
});

it('rejects unknown runtime messages by default instead of returning blanket success', async () => {
  await loadHarness();

  await expect(chrome.runtime.sendMessage({ type: 'UNHANDLED_RUNTIME_MESSAGE' })).rejects.toThrow(
    'No harness runtime response configured for UNHANDLED_RUNTIME_MESSAGE'
  );
});

it('allows explicit typed-success runtime fallback through harness bootstrap', async () => {
  await loadHarness({
    apiBehavior: {
      runtimeFallback: 'typed-success',
    },
  });

  await expect(chrome.runtime.sendMessage({ type: 'UNHANDLED_RUNTIME_MESSAGE' })).resolves.toEqual({
    success: true,
  });
});

it('emits trusted offscreen commands with authorization metadata and background ownership', async () => {
  await loadHarness();
  const listener = vi.fn();
  const unsubscribe = browserRuntime.subscribeToMessages(listener);

  window.__sniptaleHarness?.emitTrustedOffscreenRuntimeMessage({ type: 'OFFSCREEN_COMMAND' });
  unsubscribe();

  expect(listener).toHaveBeenCalledOnce();
  expect(listener.mock.calls[0]?.[0]).toMatchObject({
    type: 'OFFSCREEN_COMMAND',
    capabilityToken: expect.any(String),
    __sniptaleRuntimeFreshness: expect.objectContaining({
      issuedAtEpochMs: expect.any(Number),
      nonce: expect.any(String),
    }),
  });
  expect(listener.mock.calls[0]?.[1]).toEqual({
    id: 'playwright-ui-harness',
    url: 'chrome-extension://playwright-ui-harness/service-worker-loader.js',
  });
});

it('replaces partial browser chrome objects with the full harness mock', async () => {
  Object.defineProperty(window, 'chrome', {
    configurable: true,
    value: { runtime: { id: 'partial-browser-runtime' } },
    writable: false,
  });

  vi.resetModules();
  await import('./browser-mocks');

  expect(window.chrome.runtime.id).toBe('playwright-ui-harness');
  expect(window.chrome.runtime.getManifest()).toEqual(
    expect.objectContaining({
      manifest_version: 3,
      name: expect.stringContaining('Harness'),
    })
  );
});

it('emits storage change events with the previous value instead of always undefined', async () => {
  await loadHarness();
  const listener = vi.fn();
  chrome.storage.onChanged.addListener(listener);

  await chrome.storage.local.set({ theme: 'light' });
  await chrome.storage.local.set({ theme: 'dark' });
  await chrome.storage.local.remove('theme');

  expect(listener).toHaveBeenNthCalledWith(
    2,
    {
      theme: {
        oldValue: 'light',
        newValue: 'dark',
      },
    },
    'local'
  );
  expect(listener).toHaveBeenNthCalledWith(
    3,
    {
      theme: {
        oldValue: 'dark',
        newValue: undefined,
      },
    },
    'local'
  );
});
