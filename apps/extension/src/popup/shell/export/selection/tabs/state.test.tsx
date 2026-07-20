// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { createVideoCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/test-support';
import { usePopupExportTabSelection } from './state';

const mocks = vi.hoisted(() => ({
  browserPermissionsContains: vi.fn(),
  browserTabsQuery: vi.fn(),
  browserStorageSessionGet: vi.fn(),
  browserStorageSessionSet: vi.fn(),
  getTabCapabilities: vi.fn(),
}));

vi.mock('../../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: (...args: unknown[]) => mocks.browserStorageSessionGet(...args),
      set: (...args: unknown[]) => mocks.browserStorageSessionSet(...args),
    },
  },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    query: (...args: unknown[]) => mocks.browserTabsQuery(...args),
  },
}));

vi.mock('@sniptale/platform/browser/permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/permissions')>()),
  browserPermissions: {
    contains: (...args: unknown[]) => mocks.browserPermissionsContains(...args),
  },
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../../features/tab-capabilities/capabilities', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../features/tab-capabilities/capabilities')
  >()),
  getTabCapabilities: (...args: unknown[]) => mocks.getTabCapabilities(...args),
}));

vi.mock('../../../../../features/tab-capabilities/url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/tab-capabilities/url')>()),
  isOwnedSnapshotViewerPage: (url: string | null | undefined) =>
    url?.includes('/apps/extension/src/web-snapshot-viewer/index.html') === true &&
    url.includes('snapshotId='),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue: ReturnType<typeof usePopupExportTabSelection> | null = null;

function createCapabilities(overrides: Partial<ActiveTabCapabilities> = {}): ActiveTabCapabilities {
  const supported = { supported: true, reason: null };

  return {
    export: supported,
    isRestrictedPage: false,
    quickActions: supported,
    restrictedPageLabel: null,
    screenshotMode: supported,
    tabId: 7,
    title: 'Current tab',
    url: 'https://example.test/current',
    videoByMode: createVideoCapabilities(supported),
    ...overrides,
  };
}

function Harness(props: { capabilities: ActiveTabCapabilities; isActive: boolean }) {
  latestValue = usePopupExportTabSelection({
    activeTabCapabilities: props.capabilities,
    isActive: props.isActive,
  });
  return null;
}

async function renderHarness(
  args: {
    capabilities?: ActiveTabCapabilities;
    isActive?: boolean;
  } = {}
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <Harness
        capabilities={args.capabilities ?? createCapabilities()}
        isActive={args.isActive ?? true}
      />
    );
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.browserTabsQuery.mockReset();
  mocks.browserPermissionsContains.mockReset();
  mocks.browserStorageSessionGet.mockReset();
  mocks.browserStorageSessionSet.mockReset();
  mocks.getTabCapabilities.mockReset();
  mocks.browserStorageSessionGet.mockResolvedValue({});
  mocks.browserStorageSessionSet.mockResolvedValue(undefined);
  mocks.browserPermissionsContains.mockResolvedValue(true);
  mocks.getTabCapabilities.mockImplementation((tab: { id?: number }) => ({
    export: {
      reason: tab.id === 8 ? 'blocked' : null,
      supported: tab.id !== 8,
    },
    isRestrictedPage: false,
  }));
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestValue = null;
  vi.unstubAllGlobals();
});

it('loads tabs from the current window and auto-selects the current exportable tab', async () => {
  mocks.browserTabsQuery.mockResolvedValue([
    { id: 7, title: 'Current tab', url: 'https://example.test/current' },
    { id: 8, title: 'Blocked tab', url: 'https://example.test/blocked' },
  ]);

  await renderHarness();
  await flushEffects();

  expect(mocks.browserTabsQuery).toHaveBeenCalledWith({ currentWindow: true });
  expect(latestValue?.selectedTabIds).toEqual([7]);
  expect(latestValue?.filteredTabs.map((tab) => [tab.tabId, tab.disabledReason])).toEqual([
    [7, null],
    [8, 'blocked'],
  ]);
});

it('includes web snapshot viewer tabs and excludes restricted extension pages', async () => {
  const viewerUrl =
    'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1';
  mocks.browserTabsQuery.mockResolvedValue([
    { id: 7, title: 'Current tab', url: 'https://example.test/current' },
    { id: 11, title: 'Source page - Sniptale Web Snapshot', url: viewerUrl },
    { id: 12, title: 'Popup', url: 'chrome-extension://test/apps/extension/src/popup/index.html' },
  ]);
  mocks.getTabCapabilities.mockImplementation((tab: { id?: number }) => ({
    export: {
      reason: null,
      supported: true,
    },
    isRestrictedPage: tab.id === 12,
  }));

  await renderHarness();
  await flushEffects();

  expect(latestValue?.filteredTabs.map((tab) => [tab.tabId, tab.title])).toEqual([
    [7, 'Current tab'],
    [11, 'Source page - Sniptale Web Snapshot'],
  ]);
});

it('does not query tabs while the export screen is inactive', async () => {
  await renderHarness({ isActive: false });
  await flushEffects();

  expect(mocks.browserTabsQuery).not.toHaveBeenCalled();
  expect(latestValue?.availableTabs).toHaveLength(1);
});

it('leaves selection empty when the current tab is not exportable', async () => {
  mocks.browserTabsQuery.mockResolvedValue([
    { id: 7, title: 'Current tab', url: 'https://example.test/current' },
    { id: 9, title: 'Other page', url: 'https://example.test/other' },
  ]);
  mocks.getTabCapabilities.mockImplementation((tab: { id?: number }) => ({
    export: {
      reason: tab.id === 7 ? 'blocked' : null,
      supported: tab.id !== 7,
    },
  }));

  await renderHarness();
  await flushEffects();

  expect(latestValue?.selectedTabIds).toEqual([]);
});

it('keeps fallback empty when tab query fails before page access is known', async () => {
  mocks.browserTabsQuery.mockRejectedValue(new Error('query failed'));

  await renderHarness();
  await flushEffects();

  expect(latestValue?.availableTabs).toHaveLength(0);
  expect(latestValue?.selectedTabIds).toEqual([]);
});

it('does not auto-select a fallback tab when the current tab export is blocked', async () => {
  mocks.browserTabsQuery.mockRejectedValue(new Error('query failed'));

  await renderHarness({
    capabilities: createCapabilities({
      export: {
        reason: 'blocked',
        supported: false,
      },
    }),
  });
  await flushEffects();

  expect(latestValue?.selectedTabIds).toEqual([]);
});

it('toggles every exportable tab on and off when the list is unfiltered', async () => {
  mocks.browserTabsQuery.mockResolvedValue([
    { id: 7, title: 'Current tab', url: 'https://example.test/current' },
    { id: 9, title: 'Current docs', url: 'https://example.test/docs' },
    { id: 10, title: 'Other page', url: 'https://example.test/other' },
  ]);

  await renderHarness();
  await flushEffects();

  await act(async () => {
    latestValue?.toggleSelectAllTabs();
  });

  expect(latestValue?.selectedTabIds).toEqual([7, 9, 10]);

  await act(async () => {
    latestValue?.toggleSelectAllTabs();
  });

  expect(latestValue?.selectedTabIds).toEqual([]);
});

it('replaces selection with filtered exportable tabs when bulk-selecting a filtered list', async () => {
  mocks.browserTabsQuery.mockResolvedValue([
    { id: 7, title: 'Current tab', url: 'https://example.test/current' },
    { id: 9, title: 'Current docs', url: 'https://example.test/docs' },
    { id: 10, title: 'Other page', url: 'https://example.test/other' },
  ]);

  await renderHarness();
  await flushEffects();

  await act(async () => {
    latestValue?.setFilterQuery('current');
  });

  expect(latestValue?.filteredTabs.map((tab) => tab.tabId)).toEqual([7, 9]);

  await act(async () => {
    latestValue?.toggleSelectAllTabs();
  });

  expect(latestValue?.selectedTabIds).toEqual([7, 9]);
});
