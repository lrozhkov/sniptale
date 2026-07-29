import { beforeEach, expect, it, vi } from 'vitest';

const tabs = vi.hoisted(() => ({
  activationListener: null as ((activeInfo: { tabId: number; windowId: number }) => void) | null,
  get: vi.fn(),
  query: vi.fn(),
  subscribeToActivated: vi.fn(
    (listener: (activeInfo: { tabId: number; windowId: number }) => void) => {
      tabs.activationListener = listener;
      return vi.fn();
    }
  ),
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({ browserTabs: tabs }));

import { createNativeFullPageRasterBackend } from './native-backend';

beforeEach(() => {
  vi.clearAllMocks();
  tabs.activationListener = null;
  tabs.get.mockResolvedValue({ active: true, id: 7, windowId: 3 });
  tabs.query.mockResolvedValue([{ active: true, id: 7, windowId: 3 }]);
});

it('checks the active target before and after native visible capture', async () => {
  const capture = vi
    .fn()
    .mockImplementation(
      async (
        _windowId: number,
        _options: chrome.extensionTypes.ImageDetails,
        beforeCapture: () => Promise<void>
      ) => {
        await beforeCapture();
        return 'data:image/png;base64,tile';
      }
    );
  const backend = await createNativeFullPageRasterBackend({ lease: { capture }, tabId: 7 });

  await expect(backend.captureFrame()).resolves.toBe('data:image/png;base64,tile');
  expect(capture).toHaveBeenCalledWith(3, { format: 'png' }, expect.any(Function));
  expect(tabs.get).toHaveBeenCalledTimes(4);
  expect(tabs.query).toHaveBeenCalledTimes(3);
});

it('rejects an away-and-back activation even when the target is active after capture', async () => {
  const capture = vi.fn().mockImplementation(async () => {
    tabs.activationListener?.({ tabId: 8, windowId: 3 });
    tabs.activationListener?.({ tabId: 7, windowId: 3 });
    return 'data:image/png;base64,foreign';
  });
  const backend = await createNativeFullPageRasterBackend({ lease: { capture }, tabId: 7 });

  await expect(backend.captureFrame()).rejects.toThrow('target changed while capturing');
});

it('rejects a captured frame when another tab becomes active during the API call', async () => {
  const capture = vi.fn().mockImplementation(async () => {
    tabs.query.mockResolvedValue([{ active: true, id: 8, windowId: 3 }]);
    return 'data:image/png;base64,foreign';
  });
  const backend = await createNativeFullPageRasterBackend({ lease: { capture }, tabId: 7 });

  await expect(backend.captureFrame()).rejects.toThrow('target changed while capturing');
});
