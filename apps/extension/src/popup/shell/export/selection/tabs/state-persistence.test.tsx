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
let sessionStore: Record<string, unknown> = {};

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

function createWindowTabs() {
  return [
    { id: 7, title: 'Current tab', url: 'https://example.test/current' },
    { id: 9, title: 'Docs tab', url: 'https://example.test/docs' },
    { id: 10, title: 'Other page', url: 'https://example.test/other' },
  ];
}

function createReorderedWindowTabs() {
  return [
    { id: 7, title: 'Current tab', url: 'https://example.test/current' },
    { id: 10, title: 'Other page', url: 'https://example.test/other' },
    { id: 9, title: 'Docs tab', url: 'https://example.test/docs' },
  ];
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
    await Promise.resolve();
  });
}

async function unmountHarness() {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestValue = null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.browserTabsQuery.mockReset();
  mocks.browserPermissionsContains.mockReset();
  mocks.browserStorageSessionGet.mockReset();
  mocks.browserStorageSessionSet.mockReset();
  mocks.getTabCapabilities.mockReset();
  sessionStore = {};
  mocks.browserPermissionsContains.mockResolvedValue(true);
  mocks.browserStorageSessionGet.mockImplementation(async (key?: string | string[]) => {
    if (typeof key === 'string') {
      return { [key]: sessionStore[key] };
    }

    return sessionStore;
  });
  mocks.browserStorageSessionSet.mockImplementation(async (items: Record<string, unknown>) => {
    sessionStore = {
      ...sessionStore,
      ...items,
    };
  });
  mocks.getTabCapabilities.mockImplementation(() => ({
    export: {
      reason: null,
      supported: true,
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

it('keeps manual selection when the active tab and ordered window tab list stay the same', async () => {
  mocks.browserTabsQuery.mockResolvedValue(createWindowTabs());

  await renderHarness();
  await flushEffects();

  await act(async () => {
    latestValue?.toggleTabSelection(9);
  });

  expect(latestValue?.selectedTabIds).toEqual([7, 9]);

  await renderHarness();
  await flushEffects();

  expect(latestValue?.selectedTabIds).toEqual([7, 9]);
});

it('restores manual selection after the export screen unmounts and mounts again', async () => {
  mocks.browserTabsQuery.mockResolvedValue(createWindowTabs());

  await renderHarness();
  await flushEffects();

  await act(async () => {
    latestValue?.toggleTabSelection(9);
  });
  await flushEffects();

  expect(latestValue?.selectedTabIds).toEqual([7, 9]);

  await unmountHarness();
  await renderHarness();
  await flushEffects();

  expect(latestValue?.selectedTabIds).toEqual([7, 9]);
});

it('resets selection when the active tab changes', async () => {
  mocks.browserTabsQuery.mockResolvedValue(createWindowTabs());

  await renderHarness();
  await flushEffects();

  await act(async () => {
    latestValue?.toggleSelectAllTabs();
  });

  expect(latestValue?.selectedTabIds).toEqual([7, 9, 10]);

  await renderHarness({
    capabilities: createCapabilities({
      tabId: 9,
      title: 'Docs tab',
      url: 'https://example.test/docs',
    }),
  });
  await flushEffects();

  expect(latestValue?.selectedTabIds).toEqual([9]);
});

it('resets selection when the ordered window tab list changes', async () => {
  mocks.browserTabsQuery.mockResolvedValue(createWindowTabs());

  await renderHarness();
  await flushEffects();

  await act(async () => {
    latestValue?.toggleTabSelection(9);
  });

  expect(latestValue?.selectedTabIds).toEqual([7, 9]);

  mocks.browserTabsQuery.mockResolvedValue(createReorderedWindowTabs());

  await renderHarness();
  await flushEffects();

  expect(latestValue?.selectedTabIds).toEqual([7]);
});
