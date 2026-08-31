// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { PreparedDOMTreeSnapshot } from '../../dom-tree-parser/snapshot';
import { collectExportExtraAssets } from './assets';
import { createExportManagerState } from './state';
import {
  createExportCancelledError,
  createExportDiagnosticsSource,
  getExportCompletedMessage,
} from './source';

const { captureScreenshot, captureViewportScreenshot } = vi.hoisted(() => ({
  captureScreenshot: vi.fn(),
  captureViewportScreenshot: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getManifest: () => ({ version: 'test' }) },
}));

vi.mock('../../web-snapshot/capture', () => ({
  captureWebSnapshotScreenshotWithWarnings: captureScreenshot,
  captureWebSnapshotViewportScreenshot: captureViewportScreenshot,
}));

function createPageDiagnosticsOnlyOptions(): ExportOptions {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includePageDiagnostics: true,
    includeImages: false,
    includeJson: false,
    includeMarkdown: false,
  };
}

function createSnapshot(): PreparedDOMTreeSnapshot {
  return {
    iframeReadiness: {
      pendingIframes: [],
      timedOut: false,
      totalIframes: 0,
    },
    tree: {
      context: 'test',
      structure: [],
      title: 'Page Diagnostics fixture',
    },
  };
}

it('selects live diagnostics for detached snapshots inside a page runtime', () => {
  const detached = document.implementation.createHTMLDocument('detached');

  expect(createExportDiagnosticsSource({ document: detached })).toMatchObject({
    document,
    view: window,
  });
  expect(
    createExportDiagnosticsSource({ document: detached, pageUrl: window.location.href })
  ).toMatchObject({ document, view: window });
  expect(
    createExportDiagnosticsSource({
      document: detached,
      pageUrl: `${window.location.origin}/other`,
    })
  ).toMatchObject({ document, view: window });
  expect(
    createExportDiagnosticsSource({ document: detached, pageUrl: 'https://other.test/' })
  ).toMatchObject({ document, view: window });
  expect(createExportDiagnosticsSource()).toBeUndefined();
});

it('exposes localized export completion and cancellation outcomes', () => {
  expect(createExportCancelledError()).toBeInstanceOf(Error);
  expect(getExportCompletedMessage()).not.toBe('');
});

it('composes the two inert DOM Page Diagnostics assets when that option is enabled alone', async () => {
  document.documentElement.replaceChildren(
    document.createElement('head'),
    document.createElement('body')
  );
  document.body.append(document.createElement('main'));

  const assets = await collectExportExtraAssets({
    downloadedFilesCount: 0,
    options: createPageDiagnosticsOnlyOptions(),
    snapshot: createSnapshot(),
    state: createExportManagerState(),
    warnings: [],
    fileCandidatesCount: 0,
    diagnosticsSource: { document },
    throwIfCancelled: () => undefined,
  });

  expect(assets.map((asset) => asset.path)).toEqual(['logs/dom.html', 'logs/virtual-dom.html']);
  expect(assets.map((asset) => asset.path)).not.toContain('logs/console.json');
  expect(assets.map((asset) => asset.path)).not.toContain('logs/page-summary.json');
});

it('reuses the full-page capture seam as a Blob export contribution', async () => {
  const screenshot = new Blob(['png'], { type: 'image/png' });
  captureScreenshot.mockResolvedValue({
    blob: screenshot,
    coverage: 'full-page',
    warnings: ['capture adjusted'],
  });
  const options = { ...createPageDiagnosticsOnlyOptions(), includeFullPageScreenshot: true };
  const warnings: string[] = [];

  const assets = await collectExportExtraAssets({
    downloadedFilesCount: 0,
    fileCandidatesCount: 0,
    fullPageCaptureIdentity: {
      action: 'EXPORT_CAPTURE_FULL_PAGE',
      exportRunId: 'job-1',
    },
    options,
    snapshot: createSnapshot(),
    state: createExportManagerState(),
    throwIfCancelled: () => undefined,
    warnings,
  });

  expect(captureScreenshot).toHaveBeenCalledWith(undefined, {
    action: 'EXPORT_CAPTURE_FULL_PAGE',
    exportRunId: 'job-1',
  });
  expect(assets).toContainEqual({ content: screenshot, path: 'page-screenshot.png' });
  expect(warnings).toContain('capture adjusted');
});

it('stores a viewport fallback under an explicit partial path instead of page-screenshot.png', async () => {
  const screenshot = new Blob(['partial'], { type: 'image/png' });
  captureScreenshot.mockResolvedValueOnce({
    blob: screenshot,
    coverage: 'viewport',
    warnings: ['Only the visible area is available'],
  });
  const warnings: string[] = [];

  const assets = await collectExportExtraAssets({
    downloadedFilesCount: 0,
    fileCandidatesCount: 0,
    options: { ...createPageDiagnosticsOnlyOptions(), includeFullPageScreenshot: true },
    snapshot: createSnapshot(),
    state: createExportManagerState(),
    throwIfCancelled: () => undefined,
    warnings,
  });

  expect(assets.map((asset) => asset.path)).not.toContain('page-screenshot.png');
  expect(assets).toContainEqual({ content: screenshot, path: 'page-viewport-preview.png' });
  expect(warnings).toContain('Only the visible area is available');
});

it('stores an optional visible-area screenshot separately from the full-page result', async () => {
  const screenshot = new Blob(['viewport'], { type: 'image/webp' });
  captureViewportScreenshot.mockResolvedValueOnce(screenshot);

  const assets = await collectExportExtraAssets({
    downloadedFilesCount: 0,
    fileCandidatesCount: 0,
    options: {
      ...createPageDiagnosticsOnlyOptions(),
      includeViewportScreenshot: true,
    },
    snapshot: createSnapshot(),
    state: createExportManagerState(),
    throwIfCancelled: () => undefined,
    warnings: [],
  });

  expect(assets).toContainEqual({
    content: screenshot,
    path: 'visible-viewport.webp',
  });
  expect(assets.map((asset) => asset.path)).not.toContain('page-viewport-preview.png');
});

it('writes consolidated issues after screenshot warnings are known', async () => {
  captureScreenshot.mockResolvedValueOnce({
    blob: new Blob(['png'], { type: 'image/png' }),
    coverage: 'full-page',
    warnings: ['Page extent grew after capture was frozen'],
  });
  const assets = await collectExportExtraAssets({
    downloadedFilesCount: 0,
    fileCandidatesCount: 0,
    options: {
      ...createPageDiagnosticsOnlyOptions(),
      includeBasicLogs: true,
      includeFullPageScreenshot: true,
    },
    snapshot: createSnapshot(),
    state: createExportManagerState(),
    throwIfCancelled: () => undefined,
    warnings: [],
  });

  const issues = assets.find((asset) => asset.path === 'logs/issues.json');
  expect(String(issues?.content)).toContain('Page extent grew after capture was frozen');
  expect(assets.find((asset) => asset.path === 'logs/capture-timeline.json')).toBeDefined();
});
