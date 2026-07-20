import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  attachDebuggerMock,
  blobToDataURLMock,
  browserDebuggerSendCommandMock,
  createCapturePartMock,
  db,
  dbRecords,
  delayMock,
  detachDebuggerMock,
  getPageDimensionsMock,
  getStitchDrawSpecMock,
  getTotalCapturePartsMock,
  hideFixedElementsMock,
  loadImageMock,
  loadSettingsMock,
  loggerDebugMock,
  loggerErrorMock,
  loggerLogMock,
  loggerWarnMock,
  parseCaptureScreenshotResultMock,
  resolveCaptureBlobOptionsMock,
  restoreFixedElementsMock,
  scrollPageMock,
} = vi.hoisted(() => {
  const records = new Map<string, unknown>();
  const keyFor = (domain: string, key: string) => `${domain}\u0000${key}`;

  return {
    attachDebuggerMock: vi.fn(),
    blobToDataURLMock: vi.fn(),
    browserDebuggerSendCommandMock: vi.fn(),
    createCapturePartMock: vi.fn(),
    db: {
      delete: vi.fn(async (_store: string, key: [string, string]) => {
        records.delete(keyFor(key[0], key[1]));
      }),
      get: vi.fn(async (_store: string, key: [string, string]) =>
        records.get(keyFor(key[0], key[1]))
      ),
      getAllFromIndex: vi.fn(async (_store: string, _indexName: string, domain: string) =>
        [...records.values()].filter(
          (record) =>
            Boolean(record) &&
            typeof record === 'object' &&
            (record as { domain?: unknown }).domain === domain
        )
      ),
      put: vi.fn(async (_store: string, record: { domain: string; key: string }) => {
        records.set(keyFor(record.domain, record.key), record);
      }),
    },
    dbRecords: records,
    delayMock: vi.fn(),
    detachDebuggerMock: vi.fn(),
    getPageDimensionsMock: vi.fn(),
    getStitchDrawSpecMock: vi.fn(),
    getTotalCapturePartsMock: vi.fn(),
    hideFixedElementsMock: vi.fn(),
    loadImageMock: vi.fn(),
    loadSettingsMock: vi.fn(),
    loggerDebugMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    loggerLogMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    parseCaptureScreenshotResultMock: vi.fn(),
    resolveCaptureBlobOptionsMock: vi.fn(),
    restoreFixedElementsMock: vi.fn(),
    scrollPageMock: vi.fn(),
  };
});

vi.mock(
  '../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
    >()),
    initDB: vi.fn(async () => db),
  })
);
vi.mock('@sniptale/foundation/utils/delay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/utils/delay')>()),
  delay: delayMock,
}));

vi.mock('@sniptale/platform/browser/debugger', () => ({
  BrowserDebuggerAdapter: undefined,
  browserDebugger: {
    sendCommand: browserDebuggerSendCommandMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  Logger: undefined,
  createLogger: () => ({
    debug: loggerDebugMock,
    error: loggerErrorMock,
    log: loggerLogMock,
    warn: loggerWarnMock,
  }),
  isTraceEnabled: vi.fn(() => false),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../debugger/session/attach', () => ({
  attachDebugger: attachDebuggerMock,
  attachDebuggerSafe: vi.fn(),
}));

vi.mock('../../debugger/session/detach', () => ({
  detachDebugger: detachDebuggerMock,
}));

vi.mock('../download/index', () => ({
  blobToDataURL: blobToDataURLMock,
  downloadImageInServiceWorker: vi.fn(),
  loadImage: loadImageMock,
}));

vi.mock('./helpers', () => ({
  createCapturePart: createCapturePartMock,
  getStitchDrawSpec: getStitchDrawSpecMock,
  getTotalCaptureParts: getTotalCapturePartsMock,
  parseCaptureScreenshotResult: parseCaptureScreenshotResultMock,
  resolveCaptureBlobOptions: resolveCaptureBlobOptionsMock,
}));

vi.mock('../page-state/index', () => ({
  getPageDimensions: getPageDimensionsMock,
  hideFixedElements: hideFixedElementsMock,
  restoreFixedElements: restoreFixedElementsMock,
  scrollPage: scrollPageMock,
}));

import { captureFullPage } from './workflow';
import { clearCaptureJobsForTests } from '../jobs/state-machine';
import { createFullPageCaptureDimensions } from './workflow.test-support';

function installCanvasMocks() {
  const drawImageMock = vi.fn();
  const convertToBlobMock = vi.fn().mockResolvedValue(new Blob(['stitched']));

  class FakeOffscreenCanvas {
    constructor(
      public width: number,
      public height: number
    ) {}

    getContext() {
      return {
        drawImage: drawImageMock,
      };
    }

    convertToBlob = convertToBlobMock;
  }

  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  return { convertToBlobMock, drawImageMock };
}

function setupSuccessFlow() {
  const dimensions = createFullPageCaptureDimensions();
  const { convertToBlobMock, drawImageMock } = installCanvasMocks();

  browserDebuggerSendCommandMock
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ data: 'raw-1' })
    .mockResolvedValueOnce({ data: 'raw-2' });
  getPageDimensionsMock.mockResolvedValue(dimensions);
  getTotalCapturePartsMock.mockReturnValue(2);
  parseCaptureScreenshotResultMock
    .mockReturnValueOnce({ data: 'shot-1' })
    .mockReturnValueOnce({ data: 'shot-2' });
  createCapturePartMock.mockImplementation(({ captureHeight, data, offsetY }) => ({
    captureHeight,
    dataUrl: `data:image/png;base64,${data}`,
    offsetY,
  }));
  loadImageMock.mockResolvedValue({ width: 1600, height: 1000 });
  getStitchDrawSpecMock.mockReturnValue({
    destHeight: 500,
    destWidth: 800,
    destX: 0,
    destY: 0,
    sourceHeight: 1000,
    sourceWidth: 1600,
    sourceX: 0,
    sourceY: 0,
  });
  loadSettingsMock.mockResolvedValue({ imageFormat: 'png', imageQuality: 90 });
  resolveCaptureBlobOptionsMock.mockReturnValue({
    quality: 0.9,
    type: 'image/png',
  });
  blobToDataURLMock.mockResolvedValue('data:image/png;base64,stitched');

  return { convertToBlobMock, dimensions, drawImageMock };
}

async function resetCaptureMocks() {
  dbRecords.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delayMock.mockResolvedValue(undefined);
  attachDebuggerMock.mockResolvedValue(undefined);
  detachDebuggerMock.mockResolvedValue(undefined);
  hideFixedElementsMock.mockResolvedValue(undefined);
  restoreFixedElementsMock.mockResolvedValue(undefined);
  scrollPageMock.mockResolvedValue(undefined);
  await clearCaptureJobsForTests();
}

function expectSuccessfulCaptureFlow(props: {
  convertToBlobMock: ReturnType<typeof vi.fn>;
  dimensions: ReturnType<typeof createFullPageCaptureDimensions>;
  drawImageMock: ReturnType<typeof vi.fn>;
  onProgress: ReturnType<typeof vi.fn>;
}) {
  expect(hideFixedElementsMock).toHaveBeenCalledWith(41);
  expect(attachDebuggerMock).toHaveBeenCalledWith(
    41,
    'screenshot',
    expect.objectContaining({ token: expect.any(String) })
  );
  expect(browserDebuggerSendCommandMock).toHaveBeenNthCalledWith(1, { tabId: 41 }, 'Page.enable');
  expect(scrollPageMock).toHaveBeenNthCalledWith(1, 41, 0);
  expect(scrollPageMock).toHaveBeenNthCalledWith(2, 41, 500);
  expect(scrollPageMock).toHaveBeenLastCalledWith(41, 0);
  expect(props.onProgress).toHaveBeenNthCalledWith(1, 1, 2);
  expect(props.onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  expect(loadImageMock).toHaveBeenCalledTimes(2);
  expect(props.drawImageMock).toHaveBeenCalledTimes(2);
  expect(props.convertToBlobMock).toHaveBeenCalledWith({ quality: 0.9, type: 'image/png' });
  expect(blobToDataURLMock).toHaveBeenCalledTimes(1);
  expect(detachDebuggerMock).toHaveBeenCalledWith(41, 'screenshot');
  expect(restoreFixedElementsMock).toHaveBeenCalledWith(41);
  expect(loggerLogMock).toHaveBeenCalledWith('Full-page capture completed', {
    parts: 2,
    tabId: 41,
  });
  expect(getPageDimensionsMock).toHaveBeenCalledWith(41);
  expect(getTotalCapturePartsMock).toHaveBeenCalledWith(
    props.dimensions.scrollHeight,
    props.dimensions.viewportHeight
  );
}

describe('capture-full-page workflow', () => {
  beforeEach(async () => {
    await resetCaptureMocks();
  });

  it('captures, stitches, and restores page state when the debugger was not attached', async () => {
    const { convertToBlobMock, dimensions, drawImageMock } = setupSuccessFlow();
    const onProgress = vi.fn();

    await expect(captureFullPage(41, onProgress)).resolves.toBe('data:image/png;base64,stitched');
    expectSuccessfulCaptureFlow({ convertToBlobMock, dimensions, drawImageMock, onProgress });
  });

  it('cleans up and rethrows when capture parsing fails after the screenshot client attaches', async () => {
    const parseError = new Error('invalid screenshot payload');
    installCanvasMocks();
    browserDebuggerSendCommandMock
      .mockRejectedValueOnce(new Error('Page.enable inactive'))
      .mockResolvedValueOnce({ invalid: true });
    getPageDimensionsMock.mockResolvedValue(createFullPageCaptureDimensions());
    getTotalCapturePartsMock.mockReturnValue(2);
    parseCaptureScreenshotResultMock.mockImplementation(() => {
      throw parseError;
    });

    await expect(captureFullPage(55)).rejects.toBe(parseError);

    expect(attachDebuggerMock).toHaveBeenCalledWith(
      55,
      'screenshot',
      expect.objectContaining({ token: expect.any(String) })
    );
    expect(detachDebuggerMock).toHaveBeenCalledWith(55, 'screenshot');
    expect(restoreFixedElementsMock).toHaveBeenCalledWith(55);
    expect(scrollPageMock).toHaveBeenLastCalledWith(55, 0);
    expect(loggerDebugMock).toHaveBeenCalledWith(
      'Page.enable failed or was already active',
      expect.any(Error)
    );
    expect(loggerErrorMock).toHaveBeenCalledWith('Full-page capture failed', parseError);
  });
});
