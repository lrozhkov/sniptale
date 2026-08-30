import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach } from 'vitest';

const tempDirs: string[] = [];

export function writeBrowserAdapterFixture(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

export function createBrowserAdapterTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-browser-adapters-'));
  tempDirs.push(root);
  return root;
}

export function writeExtendedRuntimeFixtures(root: string) {
  return {
    offscreenFile: writeBrowserAdapterFixture(
      root,
      'apps/extension/src/background/offscreen.ts',
      'chrome.offscreen.createDocument({ url: "x", reasons: ["USER_MEDIA"], justification: "x" });\n'
    ),
    runtimeFile: writeBrowserAdapterFixture(
      root,
      'apps/extension/src/background/runtime-info.ts',
      [
        'export const version = chrome.runtime.getManifest().version;',
        'export const keepAlive = () => chrome.runtime.getPlatformInfo(() => {});',
      ].join('\n')
    ),
    tabCaptureFile: writeBrowserAdapterFixture(
      root,
      'apps/extension/src/content/tab-capture.ts',
      'chrome.tabCapture.getMediaStreamId({ targetTabId: 1 }, () => {});\n'
    ),
  };
}

export function createBrowserGlobalViolationFixtures(root: string) {
  return {
    channelFile: writeBrowserAdapterFixture(
      root,
      'apps/extension/src/popup/popup-channel.ts',
      'const channel = new BroadcastChannel("demo");\n'
    ),
    historyFile: writeBrowserAdapterFixture(
      root,
      'apps/extension/src/content/parser/export-manager/files.ts',
      'window.history.replaceState({}, "", "/next");\n'
    ),
    localStorageFile: writeBrowserAdapterFixture(
      root,
      'apps/extension/src/content/parser/export-manager/data.ts',
      'export const readFlag = () => window.localStorage.getItem("x");\n'
    ),
  };
}

export function createBrowserGlobalOwnerFixtures(root: string) {
  return {
    channelOwner: writeBrowserAdapterFixture(
      root,
      'apps/extension/src/features/media-hub/events/index.ts',
      'const channel = new BroadcastChannel("sniptale-media-hub");\n'
    ),
    historyOwner: writeBrowserAdapterFixture(
      root,
      'apps/extension/src/video-editor/runtime/browser-driver/index.ts',
      'window.history.replaceState({}, "", "/editor");\n'
    ),
    localStorageOwner: writeBrowserAdapterFixture(
      root,
      'apps/extension/src/ui/theme/preference-service.ts',
      'window.localStorage.setItem("theme", "dark");\n'
    ),
    loggerOwner: writeBrowserAdapterFixture(
      root,
      'packages/platform/src/observability/logger/index.ts',
      'export const readTraceFlag = () => window.localStorage.getItem("trace");\n'
    ),
  };
}
