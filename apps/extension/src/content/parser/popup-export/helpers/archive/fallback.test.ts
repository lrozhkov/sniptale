// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ExportResult } from '@sniptale/runtime-contracts/export';

const loggerSpy = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../platform/i18n')>();
  return {
    ...actual,
    translate: (key: string) => `translated:${key}`,
  };
});

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => loggerSpy,
}));

import { fallbackToDirectDownload } from './fallback';

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

function installObjectUrlApi(): void {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:popup-export'),
    revokeObjectURL: vi.fn(),
  });
}

function installAnchorClickMock(clickImpl: () => void): void {
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation(
    (tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName === 'a') {
        vi.spyOn(element as HTMLAnchorElement, 'click').mockImplementation(clickImpl);
      }

      return element;
    }
  );
}

beforeEach(() => {
  loggerSpy.warn.mockClear();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('downloads the archive directly after a background-save failure', async () => {
  installAnchorClickMock(vi.fn());
  installObjectUrlApi();

  await expect(
    fallbackToDirectDownload(
      createExportResult({
        blob: new Blob(['zip'], { type: 'application/zip' }),
      }),
      new Error('save failed')
    )
  ).resolves.toEqual([]);

  expect(loggerSpy.warn).toHaveBeenCalledWith('Background save failed, using direct download', {
    error: expect.any(Error),
    filename: 'popup-export.zip',
  });
});

it('returns a translated fallback error when direct download fails', async () => {
  const fallbackError = new Error('direct-download-failed');

  installAnchorClickMock(() => {
    throw fallbackError;
  });
  installObjectUrlApi();

  await expect(
    fallbackToDirectDownload(
      createExportResult({
        blob: new Blob(['zip'], { type: 'application/zip' }),
      }),
      new Error('save failed')
    )
  ).resolves.toEqual([fallbackError.message]);
});
