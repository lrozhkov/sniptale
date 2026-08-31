// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';

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
  return createPagePackageManifestFixture({
    source: {
      faviconUrl: null,
      title: 'Source title',
      url: 'https://example.test/source',
    },
  });
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
    request: { exportRunId: 'viewer-export-run', type: 'EXPORT_POPUP_CANCEL' },
    sendResponse,
  });

  expect(mocks.handlePreparationPopupExportRequest).toHaveBeenCalledWith({
    controller: null,
    request: { exportRunId: 'viewer-export-run', type: 'EXPORT_POPUP_CANCEL' },
    sendResponse,
  });
});
