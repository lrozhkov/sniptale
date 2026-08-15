import { expect, it } from 'vitest';

import {
  isExportOptions,
  isPopupExportJobStatus,
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
      includePageDiagnostics: false,
      includeCssDiagnostics: false,
      includeFullPageScreenshot: true,
    })
  ).toBe(true);

  expect(
    isExportOptions({
      includeAnnotations: true,
      includeJson: true,
      includeMarkdown: true,
      includeFiles: true,
      includeImages: true,
      includeBasicLogs: false,
      includePageDiagnostics: false,
      includeCssDiagnostics: false,
      includeFullPageScreenshot: true,
    })
  ).toBe(true);

  expect(
    isExportOptions({
      includeAnnotations: 'yes',
      includeJson: true,
      includeMarkdown: true,
      includeFiles: true,
      includeImages: true,
      includeBasicLogs: false,
      includePageDiagnostics: false,
      includeCssDiagnostics: false,
      includeFullPageScreenshot: true,
    })
  ).toBe(false);

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
  expect(
    isExportProgress({
      phase: 'networking',
      message: '',
      current: 0,
      total: 0,
      errors: [],
    })
  ).toBe(false);
  expect(isExportProgress({ phase: 'idle', message: '', current: -1, total: 0, errors: [] })).toBe(
    false
  );
});

it('narrows popup export job phases and positive integer revisions', () => {
  const status = {
    activatedTabIds: [],
    effectiveOptions: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
      includePageDiagnostics: false,
    },
    jobId: 'job-1',
    orderedTabs: [{ tabId: 7, title: 'Page' }],
    originalActiveTabs: [],
    phase: 'running',
    progress: { current: 0, errors: [], message: '', phase: 'scanning', total: 1 },
    revision: 1,
    warnings: [],
  };

  expect(isPopupExportJobStatus(status)).toBe(true);
  expect(isPopupExportJobStatus({ ...status, phase: 'unknown' })).toBe(false);
  expect(isPopupExportJobStatus({ ...status, revision: 0 })).toBe(false);
  expect(isPopupExportJobStatus({ ...status, revision: 1.5 })).toBe(false);
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

it('rejects popup export entries with both content representations', () => {
  expect(
    isPopupExportPackageResponse({
      success: true,
      pagePackage: {
        archiveBaseName: 'page',
        entries: [
          {
            binaryBase64: 'ZmFrZQ==',
            path: 'page.json',
            textContent: '{}',
          },
        ],
        errors: [],
        stats: {
          sectionsCount: 0,
          rowsCount: 0,
          filesCount: 0,
          filesFailed: 0,
        },
      },
    })
  ).toBe(false);
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
