import { describe, expect, it } from 'vitest';

import {
  collectBrowserAdapterViolations,
  runBrowserAdapterCheck,
} from './verify-browser-adapters.mjs';
import { filterAstGrepAuditFiles } from '../audits/ast-grep.mjs';
import {
  createBrowserAdapterTempRoot as createTempRoot,
  createBrowserGlobalOwnerFixtures,
  createBrowserGlobalViolationFixtures,
  writeBrowserAdapterFixture as writeFile,
  writeExtendedRuntimeFixtures,
} from './verify-browser-adapters.test-support';

function expectBrowserGlobalViolations(root: string, files: string[]) {
  expect(collectBrowserAdapterViolations(files, { root })).toEqual([
    expect.objectContaining({
      rule: 'browser-local-storage-direct',
      file: expect.stringContaining('apps/extension/src/content/parser/export-manager/data.ts'),
    }),
    expect.objectContaining({
      rule: 'browser-history-direct',
      file: expect.stringContaining('apps/extension/src/content/parser/export-manager/files.ts'),
    }),
    expect.objectContaining({
      rule: 'browser-broadcast-channel-direct',
      file: expect.stringContaining('apps/extension/src/popup/popup-channel.ts'),
    }),
  ]);
}

function expectExtendedRuntimeViolations(root: string, files: string[]) {
  expect(collectBrowserAdapterViolations(files, { root })).toEqual([
    expect.objectContaining({
      rule: 'browser-runtime-info',
      file: expect.stringContaining('apps/extension/src/background/runtime-info.ts'),
    }),
    expect.objectContaining({
      rule: 'browser-offscreen-direct',
      file: expect.stringContaining('apps/extension/src/background/offscreen.ts'),
    }),
    expect.objectContaining({
      rule: 'browser-tab-capture-direct',
      file: expect.stringContaining('apps/extension/src/content/tab-capture.ts'),
    }),
  ]);
}

describe('collectBrowserAdapterViolations baseline violations', () => {
  it('flags direct storage calls outside the adapter seam', () => {
    const root = createTempRoot();

    const file = writeFile(
      root,
      'apps/extension/src/composition/persistence/storage/example.ts',
      'export function demo() { return chrome.storage.local.get(["x"]); }\n'
    );

    expect(collectBrowserAdapterViolations([file], { root })).toEqual([
      expect.objectContaining({
        rule: 'browser-storage-direct',
        file: expect.stringContaining(
          'apps/extension/src/composition/persistence/storage/example.ts'
        ),
      }),
    ]);
  });

  it('flags direct tab listener subscriptions outside the adapter seam', () => {
    const root = createTempRoot();

    const file = writeFile(
      root,
      'apps/extension/src/popup/example.ts',
      'chrome.tabs.onUpdated.addListener(() => {});\n'
    );

    expect(collectBrowserAdapterViolations([file], { root })).toEqual([
      expect.objectContaining({
        rule: 'browser-tabs-listener',
        file: expect.stringContaining('apps/extension/src/popup/example.ts'),
      }),
    ]);
  });
});

describe('collectBrowserAdapterViolations baseline allowances', () => {
  it('allows direct browser calls inside the shared browser adapter seam', () => {
    const root = createTempRoot();

    const file = writeFile(
      root,
      'packages/platform/src/browser/tabs.ts',
      'export const demo = () => chrome.tabs.query({ active: true, currentWindow: true });\n'
    );

    expect(collectBrowserAdapterViolations([file], { root })).toEqual([]);
  });

  it('rejects a suffix-spoofed browser adapter path', () => {
    const root = createTempRoot();
    const file = writeFile(
      root,
      'spoof/packages/platform/src/browser/tabs.ts',
      'export const demo = () => chrome.tabs.query({ active: true });\n'
    );

    expect(collectBrowserAdapterViolations([file], { root })).toEqual([
      expect.objectContaining({ rule: 'browser-tabs-direct' }),
    ]);
  });
});

function runExtendedRuntimeRuleSuite() {
  it('flags direct runtime metadata, offscreen, and tab-capture calls outside the adapter seam', () => {
    const root = createTempRoot();
    const { offscreenFile, runtimeFile, tabCaptureFile } = writeExtendedRuntimeFixtures(root);

    expectExtendedRuntimeViolations(root, [runtimeFile, offscreenFile, tabCaptureFile]);
  });

  it('flags direct browser action badge and title mutations outside the adapter seam', () => {
    const root = createTempRoot();

    const file = writeFile(
      root,
      'apps/extension/src/background/media/video-state.ts',
      'chrome.action.setBadgeText({ text: "REC" });\n'
    );

    expect(collectBrowserAdapterViolations([file], { root })).toEqual([
      expect.objectContaining({
        rule: 'browser-action-direct',
        file: expect.stringContaining('apps/extension/src/background/media/video-state.ts'),
      }),
    ]);
  });

  it('flags direct localStorage, history, and BroadcastChannel usage outside registered owners', () => {
    const root = createTempRoot();
    const { channelFile, historyFile, localStorageFile } =
      createBrowserGlobalViolationFixtures(root);

    expectBrowserGlobalViolations(root, [localStorageFile, historyFile, channelFile]);
  });

  it('allows current explicit owner files for browser globals', () => {
    const root = createTempRoot();
    const { channelOwner, historyOwner, localStorageOwner, loggerOwner } =
      createBrowserGlobalOwnerFixtures(root);

    expect(
      collectBrowserAdapterViolations(
        [localStorageOwner, historyOwner, channelOwner, loggerOwner],
        { root }
      )
    ).toEqual([]);
  });
}

function runExtendedRuntimeAuditParitySuite() {
  it('keeps repo-audit ast-grep filtering aligned with browser-adapter allowlists', () => {
    const root = createTempRoot();
    const { channelOwner, historyOwner, localStorageOwner, loggerOwner } =
      createBrowserGlobalOwnerFixtures(root);
    const { channelFile, historyFile, localStorageFile } =
      createBrowserGlobalViolationFixtures(root);
    const testFile = writeFile(
      root,
      'apps/extension/src/content/browser-adapter-runtime.test.ts',
      'chrome.runtime.getManifest().version;\n'
    );

    expect(
      filterAstGrepAuditFiles(
        [
          localStorageOwner,
          historyOwner,
          channelOwner,
          loggerOwner,
          channelFile,
          historyFile,
          localStorageFile,
          testFile,
        ],
        undefined,
        { root }
      )
    ).toEqual([channelFile, historyFile, localStorageFile]);
  });

  it('flags stale allowlisted owner targets before browser adapter scanning', () => {
    const root = createTempRoot();
    const file = writeFile(
      root,
      'apps/extension/src/content/parser/export-manager/data.ts',
      'export const readFlag = () => window.localStorage.getItem("x");\n'
    );

    expect(runBrowserAdapterCheck({ files: [file], root }).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'browser-adapter-owner-missing-target',
          file: 'tooling/qa/policy/browser-adapters-owners.mjs',
        }),
      ])
    );
  });
}

describe('collectBrowserAdapterViolations extended runtime rules', runExtendedRuntimeRuleSuite);
describe(
  'collectBrowserAdapterViolations extended runtime audit parity',
  runExtendedRuntimeAuditParitySuite
);
