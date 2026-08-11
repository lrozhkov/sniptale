import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, setMock } = vi.hoisted(() => ({ getMock: vi.fn(), setMock: vi.fn() }));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: getMock, set: setMock } },
}));

import {
  DEFAULT_SCREENSHOT_SETUP_STATE,
  loadScreenshotSetupState,
  patchScreenshotSetupState,
} from './screenshot';

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue({});
  setMock.mockResolvedValue(undefined);
});

it('loads defaults without repairing missing or malformed storage', async () => {
  getMock.mockResolvedValue({ sniptale_screenshot_setup: { selectedMode: 'bad', tab: 42 } });
  await expect(loadScreenshotSetupState()).resolves.toEqual(DEFAULT_SCREENSHOT_SETUP_STATE);
  expect(setMock).not.toHaveBeenCalled();
});

it('normalizes desktop and clipboard fields on read without writing', async () => {
  getMock.mockResolvedValue({
    sniptale_screenshot_setup: {
      selectedMode: 'desktop',
      desktop: {
        ...DEFAULT_SCREENSHOT_SETUP_STATE.desktop,
        delay: 10,
        exitAfterCapture: true,
        imageFormat: 'webp',
        imageQuality: 80,
        afterCapture: 'copy',
        viewportPresetId: 'wide',
      },
    },
  });
  const state = await loadScreenshotSetupState();
  expect(state.desktop).toEqual({
    ...DEFAULT_SCREENSHOT_SETUP_STATE.desktop,
    afterCapture: 'copy',
    imageFormat: 'png',
  });
  expect(setMock).not.toHaveBeenCalled();
});

it.each([
  { screenshotMode: 'desktop' },
  { viewportPresetId: 4 },
  { delay: 2 },
  { afterCapture: 'publish' },
  { imageFormat: 'gif' },
  { imageQuality: 0 },
  { exitAfterCapture: 'yes' },
])('drops a malformed tab draft field %o', async (patch) => {
  getMock.mockResolvedValue({
    sniptale_screenshot_setup: {
      tab: { ...DEFAULT_SCREENSHOT_SETUP_STATE.tab, ...patch },
    },
  });
  await expect(loadScreenshotSetupState()).resolves.toMatchObject({
    tab: DEFAULT_SCREENSHOT_SETUP_STATE.tab,
  });
  expect(setMock).not.toHaveBeenCalled();
});

it('serializes a top-level patch through the persistence mutation owner', async () => {
  await patchScreenshotSetupState({ selectedMode: 'tab' });
  expect(setMock).toHaveBeenCalledWith(
    { sniptale_screenshot_setup: { ...DEFAULT_SCREENSHOT_SETUP_STATE, selectedMode: 'tab' } },
    expect.any(Object)
  );
});
