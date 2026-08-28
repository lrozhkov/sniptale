import { expect, it } from 'vitest';
import {
  MAX_POPUP_EXPORT_JOB_TABS,
  MAX_POPUP_EXPORT_STATUS_TEXT_BYTES,
} from '@sniptale/runtime-contracts/export';

import {
  isExportOptions,
  isPagePackageJobStatus,
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
      unexpected: true,
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
    effectiveComponentPlan: {
      components: {
        attachments: false,
        diagnostics: false,
        images: true,
        pageData: true,
        webCopy: false,
      },
      diagnosticsLevel: 'none',
      includeScreenshot: false,
    },
    intent: 'export',
    jobId: 'job-1',
    orderedTabs: [{ tabId: 7, title: 'Page' }],
    originalActiveTabs: [],
    pageOutcomes: [{ ordinal: 0, status: 'pending', tabId: 7 }],
    phase: 'running',
    progress: { current: 0, errors: [], message: '', phase: 'scanning', total: 1 },
    revision: 1,
    warnings: [],
  };

  expect(isPagePackageJobStatus(status)).toBe(true);
  expect(isPagePackageJobStatus({ ...status, phase: 'unknown' })).toBe(false);
  expect(isPagePackageJobStatus({ ...status, revision: 0 })).toBe(false);
  expect(isPagePackageJobStatus({ ...status, revision: 1.5 })).toBe(false);
  expect(isPagePackageJobStatus({ ...status, unexpected: true })).toBe(false);
  expect(
    isPagePackageJobStatus({
      ...status,
      progress: { ...status.progress, message: 'x'.repeat(MAX_POPUP_EXPORT_STATUS_TEXT_BYTES + 1) },
    })
  ).toBe(false);
  expect(
    isPagePackageJobStatus({
      ...status,
      progress: {
        ...status.progress,
        errors: Array.from({ length: MAX_POPUP_EXPORT_JOB_TABS + 1 }, () => 'failure'),
      },
    })
  ).toBe(false);
  expect(
    isPagePackageJobStatus({
      ...status,
      originalActiveTabs: Array.from({ length: MAX_POPUP_EXPORT_JOB_TABS + 1 }, () => ({
        tabId: 1,
        windowId: 1,
      })),
    })
  ).toBe(false);
  expect(
    isPagePackageJobStatus({
      ...status,
      activatedTabIds: Array.from({ length: MAX_POPUP_EXPORT_JOB_TABS + 1 }, (_, index) => index),
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

  const validResult = {
    success: true,
    errors: [],
    stats: { sectionsCount: 0, rowsCount: 0, filesCount: 0, filesFailed: 0 },
  };
  expect(
    isPopupExportResult({
      ...validResult,
      filename: 'x'.repeat(MAX_POPUP_EXPORT_STATUS_TEXT_BYTES + 1),
    })
  ).toBe(false);
  expect(
    isPopupExportResult({
      ...validResult,
      snapshotIds: Array.from({ length: MAX_POPUP_EXPORT_JOB_TABS + 1 }, () => 'snapshot'),
    })
  ).toBe(false);
  expect(isPopupExportResult({ ...validResult, stats: { ...validResult.stats, extra: 1 } })).toBe(
    false
  );
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
      stagedPagePackage: {
        jobId: 'job-1',
        manifestSha256: 'a'.repeat(64),
        manifestSize: 512,
        ordinal: 0,
        pageId: 'page-1',
        producerStats: { filesCount: 1, filesFailed: 0, rowsCount: 2, sectionsCount: 1 },
        stagedBlobId: 'stage-1',
        title: 'Page',
        totalBytes: 1024,
      },
    })
  ).toBe(true);
});

it('rejects oversized or inconsistent popup package boundary values', () => {
  const stagedPagePackage = {
    jobId: 'job-1',
    manifestSha256: 'a'.repeat(64),
    manifestSize: 512,
    ordinal: 0,
    pageId: 'page-1',
    producerStats: { filesCount: 1, filesFailed: 0, rowsCount: 2, sectionsCount: 1 },
    stagedBlobId: 'stage-1',
    title: 'Page',
    totalBytes: 1024,
  };

  expect(isPopupExportPackageResponse({ success: false, error: 'x'.repeat(4 * 1024 + 1) })).toBe(
    false
  );
  expect(
    isPopupExportPackageResponse({
      success: true,
      stagedPagePackage: { ...stagedPagePackage, jobId: 'x'.repeat(513) },
    })
  ).toBe(false);
  expect(
    isPopupExportPackageResponse({
      success: true,
      stagedPagePackage: { ...stagedPagePackage, manifestSize: 0 },
    })
  ).toBe(false);
  expect(
    isPopupExportPackageResponse({
      success: true,
      stagedPagePackage: { ...stagedPagePackage, totalBytes: 1 },
    })
  ).toBe(false);
  expect(
    isPopupExportPackageResponse({
      success: true,
      stagedPagePackage: { ...stagedPagePackage, ordinal: 999 },
    })
  ).toBe(false);
  expect(
    isPopupExportPackageResponse({
      success: true,
      stagedPagePackage: { ...stagedPagePackage, title: 'e\u0301' },
    })
  ).toBe(false);
});

it('rejects retired inline package payloads', () => {
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
