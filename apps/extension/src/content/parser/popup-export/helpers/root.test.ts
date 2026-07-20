// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { ExportOptions, ExportResult } from '@sniptale/runtime-contracts/export';

const loggerSpy = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
}));
const sendRuntimeMessageMock = vi.hoisted(() => vi.fn());
const convertTreeToMarkdownMock = vi.hoisted(() => vi.fn(() => '# popup export'));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => `translated:${key}`,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => loggerSpy,
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../dom-tree-parser/ai/format', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../dom-tree-parser/ai/format')>()),
  convertTreeToMarkdown: convertTreeToMarkdownMock,
}));

import {
  buildPopupExportPreview,
  emitPopupExportMessage,
  mapPopupExportResult,
  parsePopupExportRequest,
  persistPopupExportArchive,
} from '.';

function createExportOptions(): ExportOptions {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };
}

function createExportResult(overrides: Partial<ExportResult> = {}): ExportResult {
  return {
    errors: [],
    filename: 'popup-export.zip',
    stats: {
      filesCount: 1,
      filesFailed: 0,
      rowsCount: 2,
      sectionsCount: 1,
    },
    success: true,
    ...overrides,
  };
}

function installAnchorClickMock(clickImpl: () => void): void {
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'a') {
      const anchor = originalCreateElement('a');
      anchor.click = clickImpl;
      return anchor;
    }

    return originalCreateElement(tagName);
  });
}

function createParsedDomTree(): ParsedDOMTree {
  return {
    context: 'ctx',
    structure: [
      {
        children: [
          {
            headers: ['name'],
            id: 'table-1',
            rows: [
              { data: { name: 'first' }, id: 'row-1', selected: true, selector: '#row-1' },
              { data: { name: 'second' }, id: 'row-2', selected: true, selector: '#row-2' },
            ],
            type: 'table',
          },
          { id: 'field-1', label: 'Label', type: 'field', value: 'Text', valueType: 'string' },
        ],
        id: 'section-1',
        title: 'Section',
        type: 'section',
      },
    ],
    title: 'Popup',
  };
}

function installObjectUrlApi(): void {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:popup-export'),
    revokeObjectURL: vi.fn(),
  });
}

beforeEach(() => {
  sendRuntimeMessageMock.mockReset();
  convertTreeToMarkdownMock.mockClear();
  loggerSpy.debug.mockClear();
  loggerSpy.warn.mockClear();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('popup-export preview helpers', () => {
  it('builds preview data with counted rows and markdown output', () => {
    const preview = buildPopupExportPreview(createParsedDomTree());

    expect(preview).toEqual({
      context: 'ctx',
      jsonPreview: expect.stringContaining('"title": "Popup"'),
      markdownPreview: '# popup export',
      rowsCount: 2,
      sectionsCount: 1,
      title: 'Popup',
    });
  });

  it('swallows popup listener transport failures and logs the debug payload', async () => {
    sendRuntimeMessageMock.mockRejectedValue(new Error('listener missing'));

    await expect(
      emitPopupExportMessage({
        progress: { current: 1, errors: [], message: 'export', phase: 'done', total: 1 },
        requestId: 'req-1',
        type: MessageType.EXPORT_POPUP_PROGRESS,
      })
    ).resolves.toBeUndefined();

    expect(loggerSpy.debug).toHaveBeenCalledWith('Popup listener is not available', {
      error: expect.any(Error),
    });
  });
});

describe('popup-export request helpers', () => {
  it('parses popup-export preview, cancel, and start requests and rejects invalid payloads', () => {
    expect(parsePopupExportRequest({ type: MessageType.EXPORT_POPUP_PREVIEW })).toEqual({
      type: MessageType.EXPORT_POPUP_PREVIEW,
    });
    expect(parsePopupExportRequest({ type: MessageType.EXPORT_POPUP_CANCEL })).toEqual({
      type: MessageType.EXPORT_POPUP_CANCEL,
    });
    expect(
      parsePopupExportRequest({
        options: createExportOptions(),
        requestId: 'req-1',
        type: MessageType.EXPORT_POPUP_START,
      })
    ).toEqual({
      options: createExportOptions(),
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_START,
    });
    expect(parsePopupExportRequest({ requestId: 42, type: MessageType.EXPORT_POPUP_START })).toBe(
      null
    );
  });

  it('marks mapped popup results as failed when archive persistence returns extra errors', () => {
    expect(mapPopupExportResult(createExportResult(), ['save failed'])).toEqual({
      errors: ['save failed'],
      filename: 'popup-export.zip',
      stats: {
        filesCount: 1,
        filesFailed: 0,
        rowsCount: 2,
        sectionsCount: 1,
      },
      success: false,
    });
  });
});

describe('popup-export persistence success paths', () => {
  it('returns early when archive persistence receives no blob or filename', async () => {
    await expect(persistPopupExportArchive(createExportResult({}))).resolves.toEqual([]);

    expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  });

  it('uses direct download without background save transport when blob persistence succeeds', async () => {
    const clickSpy = vi.fn();
    installAnchorClickMock(clickSpy);
    installObjectUrlApi();

    await expect(
      persistPopupExportArchive(
        createExportResult({
          blob: new Blob(['zip'], { type: 'application/zip' }),
        })
      )
    ).resolves.toEqual([]);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
    expect(loggerSpy.warn).not.toHaveBeenCalled();
  });
});

describe('popup-export persistence fallback paths', () => {
  it('uses direct download for content archive persistence', async () => {
    const clickSpy = vi.fn();
    installAnchorClickMock(clickSpy);
    installObjectUrlApi();

    await expect(
      persistPopupExportArchive(
        createExportResult({
          blob: new Blob(['zip'], { type: 'application/zip' }),
        })
      )
    ).resolves.toEqual([]);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  });

  it('returns a translated fallback error when direct download also fails', async () => {
    installAnchorClickMock(() => {
      throw new Error('download blocked');
    });
    installObjectUrlApi();

    await expect(
      persistPopupExportArchive(
        createExportResult({
          blob: new Blob(['zip'], { type: 'application/zip' }),
        })
      )
    ).resolves.toEqual(['download blocked']);
  });
});
