import { beforeEach, expect, it, vi } from 'vitest';

const {
  createTextObjectMock,
  formatDateTimeMock,
  getBrowserVersionMock,
  getCurrentLocaleMock,
  resizeTextCalloutMock,
  translateMock,
} = vi.hoisted(() => ({
  createTextObjectMock: vi.fn(),
  formatDateTimeMock: vi.fn(),
  getBrowserVersionMock: vi.fn(),
  getCurrentLocaleMock: vi.fn(),
  resizeTextCalloutMock: vi.fn(),
  translateMock: vi.fn(),
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

vi.mock('../../objects/annotation/text', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text')>()),
  DEFAULT_EDITOR_TEXTBOX_WIDTH: 280,
  createTextObject: createTextObjectMock,
}));

vi.mock('../../objects/annotation/text/callout/resize', () => ({
  resizeTextCallout: resizeTextCalloutMock,
}));

import { createTechnicalDataTextObject } from './technical-data-insertion/factory';

beforeEach(() => {
  createTextObjectMock.mockReset();
  formatDateTimeMock.mockReset();
  getBrowserVersionMock.mockReset();
  getCurrentLocaleMock.mockReset();
  resizeTextCalloutMock.mockReset();
  translateMock.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') });
  getCurrentLocaleMock.mockReturnValue('en');
  formatDateTimeMock.mockReturnValue('Apr 7, 2026, 10:15 AM');
  getBrowserVersionMock.mockReturnValue('Chrome 136');
  translateMock.mockImplementation((key: string) => {
    const translations: Record<string, string> = {
      'editor.runtime.metaStampBrowserLabel': 'Browser',
      'editor.runtime.metaStampDateLabel': 'Date and time',
      'editor.runtime.metaStampPageLabel': 'Page',
      'editor.runtime.metaStampUrlLabel': 'Page URL',
    };

    return translations[key] ?? key;
  });
  resizeTextCalloutMock.mockImplementation(
    (
      text: { height?: number; set?: (patch: Record<string, unknown>) => void; width?: number },
      width: number
    ) => {
      text.width = width;
      text.height = 20;
      text.set?.({ width });
    }
  );
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

it('creates technical data as one ordered text object', () => {
  const set = vi.fn();
  createTextObjectMock.mockReturnValue({ height: 54, id: 'text', set, width: 280 });

  createTechnicalDataTextObject({
    kinds: ['browser', 'url', 'date'],
    nextLabelIndex: 5,
    prepareObject: vi.fn(),
    source: createMetaStampSource(),
    sourceTitle: 'Welcome',
    sourceUrl: 'https://example.com',
    textSettings: createTextSettings(),
  });

  expect(createTextObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'uuid-1',
      labelIndex: 5,
      left: 30,
      settings: expect.objectContaining({ calloutFormat: 'plain' }),
      top: 40,
      text:
        'Page URL\nhttps://example.com\n\nDate and time\nApr 7, 2026, 10:15 AM\n\n' +
        'Browser\nChrome 136\nPage: Welcome',
    })
  );
  expect(set).toHaveBeenCalledWith({ left: 30, top: 266 });
});

it('creates row technical data without line breaks and expands the text box width', () => {
  const set = vi.fn();
  createTextObjectMock.mockReturnValue({ height: 42, id: 'text', set, width: 280 });

  createTechnicalDataTextObject({
    kinds: ['browser', 'url'],
    layout: 'row',
    nextLabelIndex: 5,
    prepareObject: vi.fn(),
    source: createMetaStampSource(),
    sourceTitle: 'Welcome',
    sourceUrl: 'https://example.com/path',
    textSettings: createTextSettings(),
  });

  expect(createTextObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      text: 'Page URL: https://example.com/path · Browser: Chrome 136 · Page: Welcome',
    })
  );
  expect(resizeTextCalloutMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'text' }),
    expect.any(Number),
    1
  );
  expect(set.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ width: expect.any(Number) }));
  expect((set.mock.calls[0]?.[0] as { width: number } | undefined)?.width).toBeGreaterThan(280);
  expect(set).toHaveBeenCalledWith({ left: 30, top: 300 });
});

it('keeps single-kind technical data formatting aligned with the legacy stamp labels', () => {
  createTextObjectMock.mockReturnValue({ height: 42, id: 'text', set: vi.fn(), width: 280 });

  createTechnicalDataTextObject({
    kinds: ['browser'],
    nextLabelIndex: 2,
    prepareObject: vi.fn(),
    source: createMetaStampSource(),
    sourceTitle: '',
    sourceUrl: 'https://example.com',
    textSettings: createTextSettings(),
  });

  expect(createTextObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({ calloutFormat: 'plain' }),
      text: 'Browser\nChrome 136',
    })
  );
});
