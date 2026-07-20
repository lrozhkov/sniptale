import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createDesktopMediaSourceChooser, getScreenCaptureSource } from './source-picker';

const translateMock = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

function createDesktopCaptureMock(result: unknown) {
  return {
    chooseDesktopMedia: vi.fn().mockResolvedValue(result),
  };
}

function createTab(tabId = 7): chrome.tabs.Tab {
  return { id: tabId, title: 'Example' } as chrome.tabs.Tab;
}

beforeEach(() => {
  vi.clearAllMocks();
  translateMock.mockImplementation((key: string) => key);
});

it('routes video desktop source selection through the window policy', async () => {
  const desktopCapture = createDesktopCaptureMock({
    status: 'selected',
    selection: { label: 'Window 1', streamId: 'window-stream' },
  });
  const chooseSource = createDesktopMediaSourceChooser({ desktopCapture });

  await expect(chooseSource(CaptureMode.SCREEN)).resolves.toEqual({
    status: 'selected',
    selection: { label: 'Window 1', streamId: 'window-stream' },
  });
  expect(desktopCapture.chooseDesktopMedia).toHaveBeenCalledWith({ sources: ['window'] });
});

it('routes screen source selection through the screen policy with a target tab', async () => {
  const tab = createTab();
  const desktopCapture = createDesktopCaptureMock({
    status: 'selected',
    selection: { label: '', streamId: 'screen-stream' },
  });

  await expect(getScreenCaptureSource(tab, { desktopCapture })).resolves.toEqual({
    mode: CaptureMode.SCREEN,
    screenName: 'shared.runtime.screenFallbackName',
    streamId: 'screen-stream',
  });
  expect(desktopCapture.chooseDesktopMedia).toHaveBeenCalledWith({
    sources: ['screen'],
    targetTab: tab,
  });
});

it('maps denied and cancelled screen selections to capture-mode failures', async () => {
  const desktopCapture = createDesktopCaptureMock({ status: 'failed', error: 'desktop denied' });

  await expect(getScreenCaptureSource(createTab(), { desktopCapture })).rejects.toThrow(
    'desktop denied'
  );

  desktopCapture.chooseDesktopMedia.mockResolvedValueOnce({ status: 'cancelled' });
  await expect(getScreenCaptureSource(createTab(), { desktopCapture })).rejects.toThrow(
    'SCREEN_SELECTION_CANCELLED'
  );
});
