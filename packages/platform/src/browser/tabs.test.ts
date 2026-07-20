import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserTabs } from './tabs';

function createListenerStub() {
  return {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
}

function createChromeTabsStub() {
  return {
    onActivated: createListenerStub(),
    onRemoved: createListenerStub(),
    onUpdated: createListenerStub(),
    captureVisibleTab: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    query: vi.fn(),
    reload: vi.fn(),
    remove: vi.fn(),
    setZoom: vi.fn(),
    update: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function installTabsStub() {
  const tabsStub = createChromeTabsStub();
  vi.stubGlobal('chrome', { tabs: tabsStub });
  return tabsStub;
}

function mockCoreTabCommands(tabsStub: ReturnType<typeof createChromeTabsStub>) {
  tabsStub.get.mockResolvedValue({ id: 1 });
  tabsStub.query.mockResolvedValue([{ id: 2 }]);
  tabsStub.create.mockResolvedValue({ id: 3 });
  tabsStub.update.mockResolvedValue({ id: 4 });
  tabsStub.remove.mockResolvedValue(undefined);
  tabsStub.reload.mockResolvedValue(undefined);
  tabsStub.setZoom.mockResolvedValue(undefined);
}

async function expectCoreTabCommandResults() {
  await expect(browserTabs.get(1)).resolves.toEqual({ id: 1 });
  await expect(browserTabs.query({ active: true })).resolves.toEqual([{ id: 2 }]);
  await expect(browserTabs.create({ active: false })).resolves.toEqual({ id: 3 });
  await expect(browserTabs.update(4, { active: true })).resolves.toEqual({ id: 4 });
  await expect(browserTabs.remove([4, 5])).resolves.toBeUndefined();
  await expect(browserTabs.reload(4, { bypassCache: true })).resolves.toBeUndefined();
  await expect(browserTabs.setZoom(4, 1.25)).resolves.toBeUndefined();
}

function expectCoreTabCommandCalls(tabsStub: ReturnType<typeof createChromeTabsStub>) {
  expect(tabsStub.get).toHaveBeenCalledWith(1);
  expect(tabsStub.query).toHaveBeenCalledWith({ active: true });
  expect(tabsStub.create).toHaveBeenCalledWith({ active: false });
  expect(tabsStub.update).toHaveBeenCalledWith(4, { active: true });
  expect(tabsStub.remove).toHaveBeenCalledWith([4, 5]);
  expect(tabsStub.reload).toHaveBeenCalledWith(4, { bypassCache: true });
  expect(tabsStub.setZoom).toHaveBeenCalledWith(4, 1.25);
}

function mockCaptureAndReloadCommands(tabsStub: ReturnType<typeof createChromeTabsStub>) {
  tabsStub.captureVisibleTab
    .mockResolvedValueOnce('both')
    .mockResolvedValueOnce('window')
    .mockResolvedValueOnce('options')
    .mockResolvedValueOnce('none');
  tabsStub.reload.mockResolvedValue(undefined);
  tabsStub.remove.mockResolvedValue(undefined);
}

async function expectCaptureAndReloadResults() {
  await expect(browserTabs.captureVisibleTab(1, { format: 'png' })).resolves.toBe('both');
  await expect(browserTabs.captureVisibleTab(2)).resolves.toBe('window');
  await expect(browserTabs.captureVisibleTab(undefined, { quality: 90 })).resolves.toBe('options');
  await expect(browserTabs.captureVisibleTab()).resolves.toBe('none');
  await expect(browserTabs.reload(8)).resolves.toBeUndefined();
  await expect(browserTabs.remove(9)).resolves.toBeUndefined();
}

function expectCaptureAndReloadCalls(tabsStub: ReturnType<typeof createChromeTabsStub>) {
  expect(tabsStub.captureVisibleTab).toHaveBeenNthCalledWith(1, 1, { format: 'png' });
  expect(tabsStub.captureVisibleTab).toHaveBeenNthCalledWith(2, 2);
  expect(tabsStub.captureVisibleTab).toHaveBeenNthCalledWith(3, { quality: 90 });
  expect(tabsStub.captureVisibleTab).toHaveBeenNthCalledWith(4);
  expect(tabsStub.reload).toHaveBeenCalledWith(8);
  expect(tabsStub.remove).toHaveBeenCalledWith(9);
}

describe('browser tabs adapter commands', () => {
  it('forwards core tab commands to chrome.tabs', async () => {
    const tabsStub = installTabsStub();
    mockCoreTabCommands(tabsStub);

    await expectCoreTabCommandResults();
    expectCoreTabCommandCalls(tabsStub);
  });

  it('handles all captureVisibleTab and reload overload combinations', async () => {
    const tabsStub = installTabsStub();
    mockCaptureAndReloadCommands(tabsStub);

    await expectCaptureAndReloadResults();
    expectCaptureAndReloadCalls(tabsStub);
  });
});

describe('browser tabs adapter listeners', () => {
  it('returns deterministic unsubscribe handles for tab event subscriptions', () => {
    const tabsStub = createChromeTabsStub();
    vi.stubGlobal('chrome', { tabs: tabsStub });

    const updatedListener = vi.fn();
    const activatedListener = vi.fn();
    const removedListener = vi.fn();

    const unsubscribeUpdated = browserTabs.subscribeToUpdated(updatedListener);
    const unsubscribeActivated = browserTabs.subscribeToActivated(activatedListener);
    const unsubscribeRemoved = browserTabs.subscribeToRemoved(removedListener);

    unsubscribeUpdated();
    unsubscribeActivated();
    unsubscribeRemoved();

    expect(tabsStub.onUpdated.addListener).toHaveBeenCalledWith(updatedListener);
    expect(tabsStub.onUpdated.removeListener).toHaveBeenCalledWith(updatedListener);
    expect(tabsStub.onActivated.addListener).toHaveBeenCalledWith(activatedListener);
    expect(tabsStub.onActivated.removeListener).toHaveBeenCalledWith(activatedListener);
    expect(tabsStub.onRemoved.addListener).toHaveBeenCalledWith(removedListener);
    expect(tabsStub.onRemoved.removeListener).toHaveBeenCalledWith(removedListener);
  });
});
