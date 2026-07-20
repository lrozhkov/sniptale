// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';

const mocks = vi.hoisted(() => ({
  createPreparationPopupExportController: vi.fn(),
  handlePreparationPopupExportRequest: vi.fn(),
  translate: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: mocks.translate,
}));

vi.mock('../../../content/public/preparation-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content/public/preparation-surface')>()),
  createPreparationPopupExportController: mocks.createPreparationPopupExportController,
  handlePreparationPopupExportRequest: mocks.handlePreparationPopupExportRequest,
}));

import { createViewerPopupExportController, handleViewerPopupExportRequest } from '.';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPreparationPopupExportController.mockReturnValue({
    dispose: vi.fn(),
    handleRequest: vi.fn(),
  });
});

function createSnapshotIframe(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  iframe.contentDocument?.body.replaceChildren(document.createElement('main'));
  if (iframe.contentDocument) {
    iframe.contentDocument.title = 'Iframe title';
  }
  return iframe;
}

function createManifest(): WebSnapshotManifest {
  return {
    captureMode: 'readOnlyNoScripts',
    capturedAt: '2026-05-13T00:00:00.000Z',
    id: 'snapshot-1',
    paths: {
      computedStyles: 'computed-styles.json',
      domSnapshot: 'dom-snapshot.json',
      errors: 'errors.json',
      manifest: 'manifest.json',
      screenshot: 'screenshot.png',
      snapshotHtml: 'snapshot.html',
      stylesheets: 'stylesheets.json',
      virtualDomSnapshot: 'virtual-dom-snapshot.json',
    },
    schemaVersion: 1,
    source: {
      faviconUrl: null,
      title: 'Source title',
      url: 'https://example.test/source',
    },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 0 },
    warnings: [],
  };
}

it('resolves popup export parsing from the displayed snapshot iframe document', () => {
  const iframe = createSnapshotIframe();
  const manifest = createManifest();

  createViewerPopupExportController({ iframe, manifest });
  const deps = mocks.createPreparationPopupExportController.mock.calls[0]?.[0];

  expect(deps.resolveSnapshotSource()).toEqual(
    expect.objectContaining({
      document: iframe.contentDocument,
      pageHostname: 'example.test',
      pageTitle: 'Source title',
      pageUrl: 'https://example.test/source',
      root: iframe.contentDocument?.body,
    })
  );
  expect(mocks.createPreparationPopupExportController).toHaveBeenCalledWith(
    expect.objectContaining({
      resolveSnapshotSource: expect.any(Function),
    })
  );
});

it('reports a failed response when the viewer export controller is unavailable', () => {
  const sendResponse = vi.fn();

  handleViewerPopupExportRequest({
    controller: null,
    request: { type: 'EXPORT_POPUP_CANCEL' },
    sendResponse,
  });

  expect(mocks.handlePreparationPopupExportRequest).toHaveBeenCalledWith({
    controller: null,
    request: { type: 'EXPORT_POPUP_CANCEL' },
    sendResponse,
  });
});
