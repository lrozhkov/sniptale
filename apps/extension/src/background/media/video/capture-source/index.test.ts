import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chooseDesktopMediaMock, getMediaStreamIdMock, translateMock } = vi.hoisted(() => ({
  chooseDesktopMediaMock: vi.fn(),
  getMediaStreamIdMock: vi.fn(),
  translateMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tab-capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/tab-capture')>()),
  browserTabCapture: {
    getMediaStreamId: getMediaStreamIdMock,
  },
}));

vi.mock('@sniptale/platform/browser/desktop-capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/desktop-capture')>()),
  browserDesktopCapture: {
    chooseDesktopMedia: chooseDesktopMediaMock,
    isAvailable: vi.fn(() => true),
  },
}));

vi.mock('../../../../platform/i18n/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/index')>()),
  translate: translateMock,
}));

import {
  createCaptureModeService,
  enrichCaptureSourceWithTabInfo,
  getCaptureSource,
  getPendingCaptureSource,
  getScreenStreamId,
  getTabCropStreamId,
  getTabStreamId,
  setPendingCaptureSource,
  supportsAnnotations,
  supportsSystemAudio,
  updateCaptureSourceCropRegion,
} from './index';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

function createTab(tabId = 7): chrome.tabs.Tab {
  return {
    id: tabId,
    title: 'Sniptale',
    url: 'https://example.test',
    favIconUrl: 'https://example.test/favicon.ico',
  } as chrome.tabs.Tab;
}

// eslint-disable-next-line max-lines-per-function -- branch-heavy ownership coverage is easier to audit as one suite.
describe('capture-source ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMediaStreamIdMock.mockResolvedValue('stream-1');
    translateMock.mockImplementation((key: string) => key);
  });

  it('keeps pending capture source isolated per service instance', () => {
    const firstService = createCaptureModeService();
    const secondService = createCaptureModeService();
    const source = {
      mode: CaptureMode.TAB,
      streamId: 'stream-1',
      tabId: 7,
    };

    firstService.setPendingCaptureSource(source);

    expect(firstService.getPendingCaptureSource()).toEqual(source);
    expect(secondService.getPendingCaptureSource()).toBeNull();
  });

  it('preserves the compatibility facade for pending capture source access', () => {
    const source = {
      mode: CaptureMode.TAB_CROP,
      streamId: 'stream-2',
      tabId: 9,
    };

    setPendingCaptureSource(source);
    expect(getPendingCaptureSource()).toEqual(source);

    setPendingCaptureSource(null);
    expect(getPendingCaptureSource()).toBeNull();
  });

  it('resolves tab capture sources for tab, crop, and viewport-emulation modes', async () => {
    const tab = createTab(11);

    await expect(getTabStreamId(11)).resolves.toEqual({
      mode: CaptureMode.TAB,
      streamId: 'stream-1',
      tabId: 11,
    });
    await expect(getTabCropStreamId(11)).resolves.toEqual({
      mode: CaptureMode.TAB_CROP,
      streamId: 'stream-1',
      tabId: 11,
    });
    await expect(getCaptureSource(CaptureMode.TAB, tab)).resolves.toEqual({
      mode: CaptureMode.TAB,
      streamId: 'stream-1',
      tabId: 11,
    });
    await expect(getCaptureSource(CaptureMode.TAB_CROP, tab)).resolves.toEqual({
      mode: CaptureMode.TAB_CROP,
      streamId: 'stream-1',
      tabId: 11,
    });
    await expect(getCaptureSource(CaptureMode.VIEWPORT_EMULATION, tab)).resolves.toEqual({
      mode: CaptureMode.TAB,
      streamId: 'stream-1',
      tabId: 11,
    });
  });

  it('does not publish tab-capture stream capabilities in shared capture source state', async () => {
    const source = await getTabStreamId(11);

    expect(source).not.toHaveProperty('streamCapabilityToken');
  });

  it('resolves screen capture source and falls back to a localized screen name', async () => {
    chooseDesktopMediaMock.mockResolvedValue({
      status: 'selected',
      selection: { label: '', streamId: 'desktop-stream' },
    });

    await expect(getScreenStreamId(createTab())).resolves.toEqual({
      mode: CaptureMode.SCREEN,
      screenName: 'shared.runtime.screenFallbackName',
      streamId: 'desktop-stream',
    });
    await expect(getCaptureSource(CaptureMode.SCREEN, createTab())).resolves.toEqual({
      mode: CaptureMode.SCREEN,
      screenName: 'shared.runtime.screenFallbackName',
      streamId: 'desktop-stream',
    });
  });

  it('rejects screen capture when the browser reports an error or no stream id', async () => {
    chooseDesktopMediaMock.mockResolvedValueOnce({ status: 'failed', error: 'desktop denied' });

    await expect(getScreenStreamId(createTab())).rejects.toThrow('desktop denied');

    chooseDesktopMediaMock.mockResolvedValueOnce({ status: 'cancelled' });

    await expect(getScreenStreamId(createTab())).rejects.toThrow('SCREEN_SELECTION_CANCELLED');
  });

  it('throws for missing tab ids and unsupported capture modes', async () => {
    await expect(
      getCaptureSource(CaptureMode.TAB, { title: 'No tab id' } as chrome.tabs.Tab)
    ).rejects.toThrow('TAB mode requires tabId');
    await expect(getCaptureSource('UNKNOWN_MODE' as CaptureMode, createTab())).rejects.toThrow(
      'Unknown capture mode: UNKNOWN_MODE'
    );
  });

  it('enriches and updates capture source metadata and capability helpers', () => {
    const source = {
      mode: CaptureMode.TAB,
      streamId: 'stream-1',
      tabId: 7,
    };

    expect(
      enrichCaptureSourceWithTabInfo(source, {
        title: 'Issue',
        url: 'https://example.test/issue',
        favIconUrl: 'https://example.test/icon.ico',
      })
    ).toEqual({
      ...source,
      tabTitle: 'Issue',
      tabUrl: 'https://example.test/issue',
      tabFavicon: 'https://example.test/icon.ico',
    });

    expect(updateCaptureSourceCropRegion(source, { x: 1, y: 2, width: 3, height: 4 })).toEqual({
      ...source,
      cropRegion: { x: 1, y: 2, width: 3, height: 4 },
    });

    expect(supportsAnnotations(CaptureMode.TAB)).toBe(true);
    expect(supportsAnnotations(CaptureMode.VIEWPORT_EMULATION)).toBe(true);
    expect(supportsAnnotations(CaptureMode.SCREEN)).toBe(false);
    expect(supportsSystemAudio(CaptureMode.TAB_CROP)).toBe(true);
    expect(supportsSystemAudio(CaptureMode.SCREEN)).toBe(false);
  });

  it('keeps capture sources unchanged when browser tab metadata is missing', () => {
    const source = {
      mode: CaptureMode.TAB,
      streamId: 'stream-1',
      tabId: 7,
    };

    expect(enrichCaptureSourceWithTabInfo(source, {})).toEqual(source);
  });
});
