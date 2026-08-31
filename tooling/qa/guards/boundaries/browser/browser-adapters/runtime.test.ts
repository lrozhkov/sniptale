import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectBrowserAdapterViolations } from './check.mjs';

const tempDirs: string[] = [];

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-browser-adapters-runtime-'));
  tempDirs.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function writeDirectBrowserCallFixtures(root: string) {
  return [
    writeFile(
      root,
      'apps/extension/src/web-snapshot-viewer/preparation/port.ts',
      'chrome.runtime.connect({});\n'
    ),
    writeFile(root, 'apps/extension/src/background/window.ts', 'chrome.windows.get(1);\n'),
    writeFile(
      root,
      'apps/extension/src/background/install.ts',
      'chrome.runtime.onInstalled.addListener(() => {});\n'
    ),
    writeFile(
      root,
      'apps/extension/src/background/message.ts',
      'chrome.runtime.onMessage.addListener(() => {});\n'
    ),
    writeFile(
      root,
      'apps/extension/src/background/navigation.ts',
      'chrome.webNavigation.onBeforeNavigate.addListener(() => {});\n'
    ),
  ];
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags direct runtime, windows, and webNavigation calls outside browser adapters', () => {
  const root = createTempRoot();
  const files = writeDirectBrowserCallFixtures(root);

  expect(collectBrowserAdapterViolations(files, { root })).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('@sniptale/platform/browser/runtime'),
      rule: 'browser-runtime-connect-direct',
    }),
    expect.objectContaining({
      message: expect.stringContaining('@sniptale/platform/browser/windows'),
      rule: 'browser-windows-direct',
    }),
    expect.objectContaining({
      message: expect.stringContaining('@sniptale/platform/browser/runtime'),
      rule: 'browser-runtime-installed-listener',
    }),
    expect.objectContaining({
      message: expect.stringContaining('@sniptale/platform/browser/runtime'),
      rule: 'browser-runtime-message-listener',
    }),
    expect.objectContaining({
      message: expect.stringContaining('@sniptale/platform/browser/web-navigation'),
      rule: 'browser-web-navigation-listener',
    }),
  ]);
});

it('allows browser adapter and runtime-messaging internals', () => {
  const root = createTempRoot();
  const files = [
    writeFile(root, 'packages/platform/src/browser/runtime.ts', 'chrome.runtime.connect({});\n'),
    writeFile(root, 'packages/platform/src/browser/windows.ts', 'chrome.windows.get(1);\n'),
    writeFile(
      root,
      'apps/extension/src/platform/runtime-messaging/transport.ts',
      'chrome.runtime.connect({ name: "transport" });\n'
    ),
  ];

  expect(collectBrowserAdapterViolations(files, { root })).toEqual([]);
});

it('ignores browser API type annotations', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/background/types.ts',
    'type Port = chrome.runtime.Port;\ntype WindowInfo = chrome.windows.Window;\n'
  );

  expect(collectBrowserAdapterViolations([file], { root })).toEqual([]);
});

it('covers remaining storage, downloads, scripting, runtime and window event namespaces', () => {
  const root = createTempRoot();
  const fixtures = [
    ['storage.ts', 'chrome.storage.onChanged.addListener(() => {});'],
    ['downloads.ts', 'chrome.downloads.download({ url: "https://example.test" });'],
    ['download-events.ts', 'chrome.downloads.onChanged.addListener(() => {});'],
    ['scripting.ts', 'chrome.scripting.executeScript({ target: { tabId: 1 }, func() {} });'],
    ['runtime-error.ts', 'void chrome.runtime.lastError;'],
    ['windows.ts', 'chrome.windows.onBoundsChanged.addListener(() => {});'],
  ].map(([name, source]) =>
    writeFile(root, `apps/extension/src/background/${name}`, `${source}\n`)
  );

  expect(collectBrowserAdapterViolations(fixtures, { root }).map(({ rule }) => rule)).toEqual([
    'browser-storage-listener',
    'browser-downloads-direct',
    'browser-downloads-listener',
    'browser-scripting-direct',
    'browser-runtime-last-error',
    'browser-windows-listener',
  ]);
});

it('validates the exact system-display owner and rejects other callers', () => {
  const root = createTempRoot();
  const owner = writeFile(
    root,
    'packages/platform/src/browser/displays.ts',
    'export const readDisplays = () => chrome.system.display.getInfo();\n'
  );
  const bypass = writeFile(
    root,
    'apps/extension/src/background/displays.ts',
    'export const readDisplays = () => chrome.system.display.getInfo();\n'
  );

  expect(collectBrowserAdapterViolations([owner], { root })).toEqual([]);
  expect(collectBrowserAdapterViolations([bypass], { root })).toEqual([
    expect.objectContaining({ rule: 'browser-system-display-direct' }),
  ]);
});
