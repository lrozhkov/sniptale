import { describe, expect, it, vi } from 'vitest';

const runtimeGetURLMock = vi.hoisted(() =>
  vi.fn((path: string) => `chrome-extension://test/${path}`)
);

import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  getExportCapability,
  getQuickActionCapability,
  getScreenshotModeCapability,
  getTabCapabilities,
  getVideoCaptureModeCapability,
} from './capabilities';
import { classifyTabRuntimeCapability } from './runtime';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { isOwnedSnapshotViewerPage, isRestrictedBrowserPage } from './url';

const EXTENSION_SOURCE_ROOT = 'apps/extension/src';
const SNAPSHOT_VIEWER_ROOT_URL = `chrome-extension://test/${EXTENSION_SOURCE_ROOT}/web-snapshot-viewer`;
const SNAPSHOT_VIEWER_PAGE_URL = `${SNAPSHOT_VIEWER_ROOT_URL}/`;
const SNAPSHOT_VIEWER_INDEX_URL = `${SNAPSHOT_VIEWER_ROOT_URL}/index.html`;
const POPUP_PAGE_URL = `chrome-extension://test/${EXTENSION_SOURCE_ROOT}/popup/index.html`;
const SNAPSHOT_VIEWER_OWNERSHIP_CASES = [
  [`${SNAPSHOT_VIEWER_INDEX_URL}?snapshotId=s1`, true],
  [`${SNAPSHOT_VIEWER_PAGE_URL}?snapshotId=s1`, true],
  [SNAPSHOT_VIEWER_INDEX_URL, false],
  [`${SNAPSHOT_VIEWER_INDEX_URL}?snapshotId=`, false],
  [`${SNAPSHOT_VIEWER_INDEX_URL}.evil?snapshotId=s1`, false],
  ['chrome-extension://test/src/%77eb-snapshot-viewer/index.html?snapshotId=s1', false],
] as const;

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: runtimeGetURLMock,
  },
}));

function createTab(overrides?: Partial<chrome.tabs.Tab>): chrome.tabs.Tab {
  return {
    active: true,
    autoDiscardable: true,
    discarded: false,
    frozen: false,
    groupId: -1,
    highlighted: true,
    id: 42,
    incognito: false,
    index: 0,
    pinned: false,
    selected: true,
    status: 'complete',
    title: 'Example',
    url: 'https://example.com/page',
    windowId: 1,
    ...overrides,
  };
}

function createMissingCapability() {
  return {
    supported: false,
    reason: 't:popup.common.noActiveTab',
  };
}

function createRestrictedVideoReason(modeLabelKey: string, pageLabel: string) {
  return [
    't:popup.labels.modeUnavailablePrefix',
    `"t:${modeLabelKey}"`,
    't:popup.labels.modeUnavailableMiddle',
    `${pageLabel}.`,
    't:popup.labels.modeUnavailableSuffix',
  ].join(' ');
}

function createMissingTabCapabilitiesExpectation() {
  const unsupported = createMissingCapability();
  const supported = { supported: true, reason: null };

  return {
    tabId: null,
    url: null,
    title: null,
    isRestrictedPage: false,
    restrictedPageLabel: null,
    screenshotMode: unsupported,
    quickActions: unsupported,
    export: unsupported,
    videoByMode: {
      [CaptureMode.TAB]: unsupported,
      [CaptureMode.TAB_CROP]: unsupported,
      [CaptureMode.CAMERA]: supported,
      [CaptureMode.VIEWPORT_EMULATION]: unsupported,
      [CaptureMode.SCREEN]: unsupported,
    },
  };
}

function createRestrictedTabCapabilitiesExpectation() {
  const supported = { supported: true, reason: null };

  return {
    tabId: 42,
    url: 'devtools://devtools/bundled/inspector.html',
    title: null,
    isRestrictedPage: true,
    restrictedPageLabel: 'devtools://',
    screenshotMode: {
      supported: false,
      reason:
        't:popup.home.screenshotUnavailablePrefix devtools://. t:popup.common.openRegularSite',
    },
    quickActions: {
      supported: false,
      reason:
        't:popup.home.quickActionsUnavailablePrefix devtools://. t:popup.common.openRegularSite',
    },
    export: {
      supported: false,
      reason: 't:popup.export.unavailablePrefix devtools://. t:popup.common.openRegularSite',
    },
    videoByMode: {
      [CaptureMode.TAB]: {
        supported: false,
        reason: createRestrictedVideoReason('popup.labels.captureModeTab', 'devtools://'),
      },
      [CaptureMode.TAB_CROP]: {
        supported: false,
        reason: createRestrictedVideoReason('popup.labels.captureModeArea', 'devtools://'),
      },
      [CaptureMode.CAMERA]: supported,
      [CaptureMode.VIEWPORT_EMULATION]: {
        supported: false,
        reason: createRestrictedVideoReason('popup.labels.captureModePreset', 'devtools://'),
      },
      [CaptureMode.SCREEN]: supported,
    },
  };
}

describe('tab-capabilities restriction detection', () => {
  it('detects supported and restricted browser pages across prefixes', expectRestrictedPages);

  it('treats viewer ownership detection as false when runtime URLs are unavailable', () => {
    runtimeGetURLMock.mockImplementationOnce(() => {
      throw new Error('chrome unavailable');
    });

    expect(isOwnedSnapshotViewerPage(`${SNAPSHOT_VIEWER_INDEX_URL}?snapshotId=s1`)).toBe(false);
  });
});

function expectRestrictedPages() {
  runtimeGetURLMock.mockClear();
  expect(isRestrictedBrowserPage(undefined)).toBe(false);
  expect(isRestrictedBrowserPage(null)).toBe(false);
  expect(isRestrictedBrowserPage('https://example.com')).toBe(false);
  expect(isRestrictedBrowserPage('file:///tmp/report.html')).toBe(true);
  expect(isRestrictedBrowserPage('data:text/html,hello')).toBe(true);
  expect(isRestrictedBrowserPage('chrome://settings')).toBe(true);
  expect(isRestrictedBrowserPage('about:blank')).toBe(true);
  expect(isRestrictedBrowserPage('view-source:https://example.com')).toBe(true);
  expectOwnedSnapshotViewerPages();
}

function expectOwnedSnapshotViewerPages() {
  for (const [url, isOwned] of SNAPSHOT_VIEWER_OWNERSHIP_CASES) {
    expect(isOwnedSnapshotViewerPage(url)).toBe(isOwned);
  }
}

describe('tab-capabilities missing tab handling', () => {
  it('returns missing-tab reasons when the active tab is unavailable', () => {
    expect(getScreenshotModeCapability()).toEqual(createMissingCapability());
    expect(getQuickActionCapability(null)).toEqual(createMissingCapability());
    expect(getExportCapability(createTab({ id: 0 }))).toEqual(createMissingCapability());
    expect(getVideoCaptureModeCapability(CaptureMode.TAB)).toEqual(createMissingCapability());
  });
});

describe('tab-capabilities supported paths', () => {
  it('returns supported capabilities for regular pages and allows screen capture on restricted pages', () => {
    const regularTab = createTab();
    const restrictedTab = createTab({ url: 'chrome://extensions' });

    expect(classifyTabRuntimeCapability(regularTab)).toBe(TabRuntimeCapability.Regular);
    expect(getScreenshotModeCapability(regularTab)).toEqual({ supported: true, reason: null });
    expect(getQuickActionCapability(regularTab)).toEqual({ supported: true, reason: null });
    expect(getExportCapability(regularTab)).toEqual({ supported: true, reason: null });
    expect(getVideoCaptureModeCapability(CaptureMode.SCREEN, restrictedTab)).toEqual({
      supported: true,
      reason: null,
    });
  });

  it('allows owned web snapshot viewer capabilities only for a valid snapshot id', () => {
    const ownedViewerTab = createTab({
      url: `${SNAPSHOT_VIEWER_PAGE_URL}?snapshotId=s1`,
    });
    const viewerWithoutSnapshotTab = createTab({ url: SNAPSHOT_VIEWER_INDEX_URL });
    const genericExtensionTab = createTab({ url: POPUP_PAGE_URL });

    expect(classifyTabRuntimeCapability(ownedViewerTab)).toBe(
      TabRuntimeCapability.OwnedSnapshotViewer
    );
    expect(getScreenshotModeCapability(ownedViewerTab)).toEqual({
      supported: true,
      reason: null,
    });
    expect(getQuickActionCapability(ownedViewerTab)).toEqual({
      supported: true,
      reason: null,
    });
    expect(getExportCapability(ownedViewerTab)).toEqual({
      supported: true,
      reason: null,
    });
    expect(getTabCapabilities(ownedViewerTab).isRestrictedPage).toBe(false);
    expect(classifyTabRuntimeCapability(viewerWithoutSnapshotTab)).toBe(
      TabRuntimeCapability.Restricted
    );
    expect(getExportCapability(viewerWithoutSnapshotTab).supported).toBe(false);
    expect(classifyTabRuntimeCapability(genericExtensionTab)).toBe(TabRuntimeCapability.Restricted);
    expect(getQuickActionCapability(genericExtensionTab).supported).toBe(false);
  });
});

describe('tab-capabilities restricted-page reasons', () => {
  it('builds restricted-page reasons with the correct page labels and mode labels', () => {
    const extensionTab = createTab({ url: 'chrome-extension://abc123/popup.html' });
    const aboutTab = createTab({ url: 'about:blank' });
    const searchTab = createTab({ url: 'chrome-search://local-ntp/local-ntp.html' });
    const fileTab = createTab({ url: 'file:///tmp/report.html' });

    expect(getScreenshotModeCapability(extensionTab)).toEqual({
      supported: false,
      reason:
        't:popup.home.screenshotUnavailablePrefix chrome-extension://. t:popup.common.openRegularSite',
    });
    expect(getQuickActionCapability(aboutTab)).toEqual({
      supported: false,
      reason: 't:popup.home.quickActionsUnavailablePrefix about://. t:popup.common.openRegularSite',
    });
    expect(getExportCapability(searchTab)).toEqual({
      supported: false,
      reason: 't:popup.export.unavailablePrefix chrome-search://. t:popup.common.openRegularSite',
    });
    expect(getQuickActionCapability(fileTab)).toEqual({
      supported: false,
      reason: 't:popup.home.quickActionsUnavailablePrefix file://. t:popup.common.openRegularSite',
    });
    expect(getVideoCaptureModeCapability(CaptureMode.TAB_CROP, extensionTab)).toEqual({
      supported: false,
      reason: createRestrictedVideoReason('popup.labels.captureModeArea', 'chrome-extension://'),
    });
    expect(getVideoCaptureModeCapability(CaptureMode.VIEWPORT_EMULATION, aboutTab)).toEqual({
      supported: false,
      reason: createRestrictedVideoReason('popup.labels.captureModePreset', 'about://'),
    });
  });
});

describe('tab-capabilities aggregated tab state', () => {
  it('creates missing-tab capabilities', () => {
    expect(getTabCapabilities()).toEqual(createMissingTabCapabilitiesExpectation());
  });

  it('aggregates restricted tab state', () => {
    const restrictedTab = createTab({
      url: 'devtools://devtools/bundled/inspector.html',
      title: undefined,
    });

    expect(getTabCapabilities(restrictedTab)).toEqual(createRestrictedTabCapabilitiesExpectation());
  });
});
