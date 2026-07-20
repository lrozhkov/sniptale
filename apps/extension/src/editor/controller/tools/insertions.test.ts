import { beforeEach, expect, it, vi } from 'vitest';

const {
  createObjectLabelMock,
  createMetaStampMock,
  createTextObjectMock,
  fabricImageFromURLMock,
  formatDateTimeMock,
  getBrowserVersionMock,
  getCurrentLocaleMock,
  translateMock,
} = vi.hoisted(() => ({
  createObjectLabelMock: vi.fn(),
  createMetaStampMock: vi.fn(),
  createTextObjectMock: vi.fn(),
  fabricImageFromURLMock: vi.fn(),
  formatDateTimeMock: vi.fn(),
  getBrowserVersionMock: vi.fn(),
  getCurrentLocaleMock: vi.fn(),
  translateMock: vi.fn(),
}));

vi.mock('fabric', () => ({
  FabricImage: {
    fromURL: fabricImageFromURLMock,
  },
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  formatDateTime: formatDateTimeMock,
  getCurrentLocale: getCurrentLocaleMock,
  translate: translateMock,
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  getBrowserVersion: getBrowserVersionMock,
}));

vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  createObjectLabel: createObjectLabelMock,
}));

vi.mock('../../objects/annotation/text', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text')>()),
  DEFAULT_EDITOR_TEXTBOX_WIDTH: 280,
  createMetaStamp: createMetaStampMock,
  createTextObject: createTextObjectMock,
}));

import { createInsertedImageObject, createMetaStampObject } from './insertions';

beforeEach(() => {
  createObjectLabelMock.mockReset();
  createMetaStampMock.mockReset();
  createTextObjectMock.mockReset();
  fabricImageFromURLMock.mockReset();
  formatDateTimeMock.mockReset();
  getBrowserVersionMock.mockReset();
  getCurrentLocaleMock.mockReset();
  translateMock.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') });
  getCurrentLocaleMock.mockReturnValue('en');
  formatDateTimeMock.mockReturnValue('Apr 7, 2026, 10:15 AM');
  getBrowserVersionMock.mockReturnValue('Chrome 136');
  createObjectLabelMock.mockReturnValue('Image 2');
  fabricImageFromURLMock.mockResolvedValue({
    height: 800,
    set: vi.fn(),
    width: 1200,
  });
  translateMock.mockImplementation((key: string) => {
    const translations: Record<string, string> = {
      'editor.runtime.metaStampBrowserLabel': 'Browser',
      'editor.runtime.metaStampDateLabel': 'Date and time',
      'editor.runtime.metaStampPageLabel': 'Page',
      'editor.runtime.metaStampUrlLabel': 'Page URL',
    };

    return translations[key] ?? key;
  });
  createMetaStampMock.mockReturnValue({ id: 'stamp' });
  createTextObjectMock.mockReturnValue({ id: 'text' });
});

function createMetaStampSource(displayHeight = 320) {
  return {
    displayHeight,
    displayWidth: 320,
    left: 10,
    top: 20,
  } as never;
}

function createTextSettings() {
  return {
    backgroundColor: '#123456',
    backgroundOpacity: 0.6,
    calloutFormat: 'panel',
    fontFamily: 'mono',
    fontSize: 16,
    fontStyle: 'normal',
    fontWeight: 'bold',
    linethrough: false,
    shadow: 30,
    textColor: '#ffffff',
    underline: false,
  } as never;
}

function expectMetaStampCall(
  index: number,
  kind: string,
  value: string,
  labelIndex: number,
  textSettings = createTextSettings()
) {
  expect(createMetaStampMock).toHaveBeenNthCalledWith(
    index,
    kind,
    value,
    30,
    292,
    labelIndex,
    textSettings
  );
}

it('creates inserted image objects with scaled placement and generated labels', async () => {
  const prepareObject = vi.fn();
  const image = await createInsertedImageObject({
    canvasHeight: 600,
    canvasWidth: 1000,
    dataUrl: 'data:image/png;base64,abc',
    name: null,
    nextLabelIndex: 2,
    prepareObject,
    source: {
      left: 50,
      top: 80,
    } as never,
  });

  expect(fabricImageFromURLMock).toHaveBeenCalledWith('data:image/png;base64,abc');
  expect((image as unknown as { set: ReturnType<typeof vi.fn> }).set).toHaveBeenCalledWith(
    expect.objectContaining({
      left: 90,
      originX: 'left',
      originY: 'top',
      scaleX: 1,
      scaleY: 1,
      top: 120,
    })
  );
  expect(createObjectLabelMock).toHaveBeenCalledWith('image', 2);
  expect((image as { sniptaleId: string }).sniptaleId).toBe('uuid-1');
  expect((image as { sniptaleLabel: string }).sniptaleLabel).toBe('Image 2');
  expect(prepareObject).toHaveBeenCalledWith(image);
});

it('formats meta stamps through the shared locale and translation seams', () => {
  createMetaStampObject({
    kind: 'browser',
    nextLabelIndex: 3,
    prepareObject: vi.fn(),
    source: {
      displayHeight: 400,
      left: 10,
      top: 20,
    } as never,
    sourceTitle: 'Welcome',
    sourceUrl: 'https://example.com',
    textSettings: createTextSettings(),
  });

  expect(createMetaStampMock).toHaveBeenCalledWith(
    'browser',
    'Browser\nChrome 136\nPage: Welcome',
    30,
    372,
    3,
    createTextSettings()
  );
  expect(getCurrentLocaleMock).toHaveBeenCalledTimes(1);
});

it('uses a translated label and fallback value for URL meta stamps', () => {
  createMetaStampObject({
    kind: 'url',
    nextLabelIndex: 1,
    prepareObject: vi.fn(),
    source: createMetaStampSource(),
    sourceTitle: '',
    sourceUrl: '',
    textSettings: createTextSettings(),
  });

  expectMetaStampCall(1, 'url', 'Page URL\nhttps://example.com', 1);
});

it('formats date meta stamps through the shared locale seam', () => {
  createMetaStampObject({
    kind: 'date',
    nextLabelIndex: 2,
    prepareObject: vi.fn(),
    source: createMetaStampSource(),
    sourceTitle: '',
    sourceUrl: 'https://example.com',
    textSettings: createTextSettings(),
  });

  expectMetaStampCall(1, 'date', 'Date and time\nApr 7, 2026, 10:15 AM', 2);
  expect(formatDateTimeMock).toHaveBeenCalledTimes(1);
});

it('omits the page label when browser meta stamps have no source title', () => {
  createMetaStampObject({
    kind: 'browser',
    nextLabelIndex: 3,
    prepareObject: vi.fn(),
    source: createMetaStampSource(),
    sourceTitle: '',
    sourceUrl: 'https://example.com',
    textSettings: createTextSettings(),
  });

  expectMetaStampCall(1, 'browser', 'Browser\nChrome 136', 3);
});
