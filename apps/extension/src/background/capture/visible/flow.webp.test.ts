import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  browserTabsCaptureVisibleTabMock,
  browserTabsGetMock,
  browserTabsQueryMock,
  createCaptureJobMock,
  finalizeCapturedDataUrlMock,
  loadSettingsMock,
  resolveVisibleCaptureApiFormatMock,
  transitionCaptureJobMock,
  withHiddenFixedElementsMock,
} = vi.hoisted(() => ({
  browserTabsCaptureVisibleTabMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  browserTabsQueryMock: vi.fn(),
  createCaptureJobMock: vi.fn(),
  finalizeCapturedDataUrlMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  resolveVisibleCaptureApiFormatMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
  withHiddenFixedElementsMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    captureVisibleTab: browserTabsCaptureVisibleTabMock,
    get: browserTabsGetMock,
    query: browserTabsQueryMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ debug: vi.fn(), log: vi.fn(), warn: vi.fn() }),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),

  loadSettings: loadSettingsMock,
}));

vi.mock('../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jobs/state-machine')>()),
  createCaptureJob: createCaptureJobMock,
  transitionCaptureJob: transitionCaptureJobMock,
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  finalizeCapturedDataUrl: finalizeCapturedDataUrlMock,
  resolveVisibleCaptureApiFormat: resolveVisibleCaptureApiFormatMock,
  withHiddenFixedElements: withHiddenFixedElementsMock,
}));

import { captureVisibleTabTransaction } from './flow';

beforeEach(() => {
  vi.clearAllMocks();
  createCaptureJobMock.mockResolvedValue({ jobId: 'capture-job-webp' });
  transitionCaptureJobMock.mockResolvedValue(undefined);
  withHiddenFixedElementsMock.mockImplementation(async (_tabId, runCapture) => ({
    hiddenCount: 0,
    result: await runCapture(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('converts native PNG wire captures to WebP output', async () => {
  const convertToBlobMock = vi.fn().mockResolvedValue(new Blob(['webp']));
  class FakeOffscreenCanvas {
    constructor(
      public width: number,
      public height: number
    ) {}
    getContext() {
      return { drawImage: vi.fn() };
    }
    convertToBlob = convertToBlobMock;
  }
  class FakeFileReader {
    public result = 'data:image/webp;base64,converted';
    public onloadend: (() => void) | null = null;
    readAsDataURL() {
      this.onloadend?.();
    }
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(new Blob()) })
  );
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 120, height: 80 }));
  vi.stubGlobal('FileReader', FakeFileReader);
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  loadSettingsMock.mockResolvedValue({ imageFormat: 'webp', imageQuality: 77 });
  resolveVisibleCaptureApiFormatMock.mockReturnValue('png');
  browserTabsGetMock.mockResolvedValue({ id: 17, windowId: 9 });
  browserTabsQueryMock.mockResolvedValue([{ id: 17, windowId: 9 }]);
  browserTabsCaptureVisibleTabMock.mockResolvedValue('data:image/png;base64,raw');
  finalizeCapturedDataUrlMock.mockImplementation(async (props) =>
    props.convertPngToWebp(props.dataUrl, props.settings.imageQuality)
  );

  await expect(captureVisibleTabTransaction(17)).resolves.toEqual({
    dataUrl: 'data:image/webp;base64,converted',
    jobId: 'capture-job-webp',
  });
  expect(convertToBlobMock).toHaveBeenCalledWith({ type: 'image/webp', quality: 0.77 });
});
