// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  activated: vi.fn(),
  updated: vi.fn(),
  getCapabilities: vi.fn((tab: { id?: number } | null) => {
    const supported = { reason: null, supported: true };
    return {
      tabId: tab?.id ?? null,
      url: null,
      title: null,
      isRestrictedPage: false,
      restrictedPageLabel: null,
      screenshotMode: supported,
      quickActions: supported,
      export: supported,
      videoByMode: {
        TAB: supported,
        TAB_CROP: supported,
        CAMERA: supported,
        SCREEN: supported,
      },
    };
  }),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    query: mocks.query,
    subscribeToActivated: (listener: () => void) => {
      mocks.activated(listener);
      return vi.fn();
    },
    subscribeToUpdated: (listener: (...args: unknown[]) => void) => {
      mocks.updated(listener);
      return vi.fn();
    },
  },
}));
vi.mock('../../../features/tab-capabilities/capabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/tab-capabilities/capabilities')>()),
  getTabCapabilities: mocks.getCapabilities,
}));

beforeEach(() => vi.clearAllMocks());

it('loads capabilities only for a mounted route and refreshes on active-tab changes', async () => {
  mocks.query.mockResolvedValue([{ id: 3 }]);
  const { useActiveTabCapabilities } = await import('./capabilities');
  function Harness() {
    const capabilities = useActiveTabCapabilities();
    return <div data-testid="tab">{capabilities.tabId ?? 'none'}</div>;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Harness />));
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="tab"]')?.textContent).toBe('3')
  );
  expect(mocks.query).toHaveBeenCalledTimes(1);
  const listener = mocks.activated.mock.calls[0]?.[0] as () => void;
  listener();
  await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(2));
  act(() => root.unmount());
});

it('falls back safely after a query failure and ignores irrelevant tab updates', async () => {
  mocks.query.mockRejectedValue(new Error('unavailable'));
  const { useActiveTabCapabilities } = await import('./capabilities');
  function Harness() {
    return <div>{useActiveTabCapabilities().tabId ?? 'none'}</div>;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  await vi.waitFor(() => expect(mocks.query).toHaveBeenCalled());
  const listener = mocks.updated.mock.calls[0]?.[0] as (
    id: number,
    change: { status?: string; url?: string },
    tab: { active: boolean }
  ) => void;
  listener(1, {}, { active: false });
  expect(mocks.query).toHaveBeenCalledTimes(1);
  await act(async () => listener(1, { status: 'complete' }, { active: true }));
  await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(2));
  await act(async () => listener(1, { url: 'https://example.com' }, { active: true }));
  await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(3));
  act(() => root.unmount());
});
