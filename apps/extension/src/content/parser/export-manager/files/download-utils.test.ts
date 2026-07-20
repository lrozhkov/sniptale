// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  extractFilenameFromContentDisposition,
  extractUuidFromUrl,
  generateFilename,
  getExtensionFromMimeType,
  getFileExtension,
  isIntermediateDownloadPageUrl,
  isValidDownloadUrl,
  resolveCredentialedDownloadUrl,
  shouldSkipHtmlDownloadResponse,
} from './download-utils';
import { extractFilenameFromContentDisposition as extractFilenameFromFileUtils } from './utils';

const pageUrl = 'https://example.com/current-page';

it('extracts ids and filenames from download metadata', () => {
  expect(extractUuidFromUrl('https://example.com/download?uuid=abc$123')).toBe('abc_123');
  expect(extractUuidFromUrl('https://example.com/download?uuid=abc$123$456')).toBe('abc_123_456');
  expect(getFileExtension('https://example.com/file.PDF?x=1')).toBe('pdf');
  expect(extractFilenameFromContentDisposition('attachment; filename=report.pdf')).toBe(
    'report.pdf'
  );
  expect(extractFilenameFromContentDisposition('attachment; filename="../x.html"')).toBe('x.html');
  expect(extractFilenameFromContentDisposition('attachment; filename="bad\u0000name.pdf"')).toBe(
    'bad_name.pdf'
  );
  expect(
    extractFilenameFromContentDisposition("attachment; filename*=UTF-8''..%2Fsecret%20x.html")
  ).toBe('secret_x.html');
  expect(
    extractFilenameFromContentDisposition(
      'attachment; filename="=?UTF-8?Q?fb37b492-1927-376c-4212-00006126a3d7.png?="'
    )
  ).toBe('fb37b492-1927-376c-4212-00006126a3d7.png');
  expect(
    extractFilenameFromFileUtils(
      'attachment; filename="=?UTF-8?Q?fb37b492-1927-376c-4212-00006126a3d7.png?="'
    )
  ).toBe('fb37b492-1927-376c-4212-00006126a3d7.png');
  expect(getExtensionFromMimeType('application/pdf')).toBe('pdf');
});

it('detects invalid or intermediate download urls', () => {
  expect(isValidDownloadUrl('javascript:void(0)', pageUrl)).toBe(false);
  expect(isValidDownloadUrl('vbscript:msgbox(\"x\")', pageUrl)).toBe(false);
  expect(isValidDownloadUrl('data:text/html;base64,PHNjcmlwdD4=', pageUrl)).toBe(false);
  expect(isValidDownloadUrl('#', pageUrl)).toBe(false);
  expect(isValidDownloadUrl('https://example.com/download?id=1', pageUrl)).toBe(true);
  expect(isValidDownloadUrl('https://user:secret@example.com/download?id=1', pageUrl)).toBe(false);
  expect(isValidDownloadUrl('https://other.example/download?id=1', pageUrl)).toBe(false);
  expect(
    isIntermediateDownloadPageUrl('https://example.com/download?action=show-download-screen')
  ).toBe(true);
  expect(
    shouldSkipHtmlDownloadResponse({
      url: 'https://example.com/export.php',
      contentType: 'text/html; charset=utf-8',
      filename: 'report',
    })
  ).toBe(true);
  expect(resolveCredentialedDownloadUrl('https://user:secret@example.com/file.pdf', pageUrl)).toBe(
    null
  );
});

it('generates stable filenames from uuids, paths and fallbacks', () => {
  expect(generateFilename('https://example.com/download?uuid=file-1', 'ignored', 1)).toBe('file-1');
  expect(generateFilename('https://example.com/download?uuid=..%2Fsecret', 'ignored', 1)).toBe(
    'secret'
  );
  expect(generateFilename('https://example.com/files/report.csv', 'ignored', 2)).toBe('report.csv');
  expect(generateFilename('https://example.com/files/%2E%2E%2Fsecret.pdf', 'ignored', 2)).toBe(
    'secret.pdf'
  );
  expect(generateFilename('https://example.com/image-preview', 'Photo', 3)).toBe('image-preview');
  expect(generateFilename('https://example.com/download', 'Quarterly Report', 3)).toBe(
    'Quarterly_Report_3.bin'
  );
});
