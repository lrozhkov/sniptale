import { expect, it } from 'vitest';

import {
  isExportOptions,
  isPopupExportPackageResponse,
  isExportProgress,
  isPopupExportPreviewResponse,
  isPopupExportResult,
} from './export';

it('accepts only complete export options payloads', () => {
  expect(
    isExportOptions({
      includeJson: true,
      includeMarkdown: true,
      includeFiles: true,
      includeImages: true,
      includeBasicLogs: false,
      includeHarDomLogs: false,
      includeCssDiagnostics: false,
      includeFullPageScreenshot: true,
    })
  ).toBe(true);

  expect(
    isExportOptions({
      includeJson: true,
    })
  ).toBe(false);
});

it('accepts valid export progress payloads', () => {
  expect(
    isExportProgress({
      activeStepKey: 'files',
      phase: 'downloading',
      message: 'Downloading',
      current: 1,
      total: 2,
      errors: [],
    })
  ).toBe(true);

  expect(
    isExportProgress({
      activeStepKey: null,
      phase: 'idle',
      message: '',
      current: 0,
      total: 0,
      errors: ['warn'],
    })
  ).toBe(true);
});

it('rejects export progress payloads with invalid active step keys', () => {
  expect(
    isExportProgress({
      activeStepKey: 'unknown',
      phase: 'idle',
      message: '',
      current: 0,
      total: 0,
      errors: [],
    })
  ).toBe(false);
});

it('accepts valid popup export results', () => {
  expect(
    isPopupExportResult({
      success: true,
      filename: 'export.zip',
      errors: [],
      stats: {
        sectionsCount: 1,
        rowsCount: 2,
        filesCount: 3,
        filesFailed: 0,
      },
    })
  ).toBe(true);
});

it('accepts valid popup export previews', () => {
  expect(
    isPopupExportPreviewResponse({
      success: true,
      preview: {
        title: 'Title',
        context: 'Portal',
        jsonPreview: '{}',
        markdownPreview: '# Title',
        sectionsCount: 1,
        rowsCount: 2,
      },
    })
  ).toBe(true);

  expect(
    isPopupExportPreviewResponse({
      success: false,
      error: 'boom',
    })
  ).toBe(true);
});

it('accepts valid popup export package responses', () => {
  expect(
    isPopupExportPackageResponse({
      success: true,
      pagePackage: {
        archiveBaseName: 'page_2026-04-09_12-00-00',
        entries: [
          {
            path: 'page_2026-04-09_12-00-00.json',
            textContent: '{}',
          },
        ],
        errors: [],
        stats: {
          sectionsCount: 1,
          rowsCount: 2,
          filesCount: 0,
          filesFailed: 0,
        },
      },
    })
  ).toBe(true);
});

it('rejects invalid popup export preview payloads', () => {
  expect(
    isPopupExportPreviewResponse({
      success: true,
      preview: {
        title: 'Title',
        context: 'Portal',
        jsonPreview: '{}',
        markdownPreview: '# Title',
        sectionsCount: '1',
        rowsCount: 2,
      },
    })
  ).toBe(false);
});
