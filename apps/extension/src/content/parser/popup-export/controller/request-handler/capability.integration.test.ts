import { expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const handlePackage = vi.hoisted(() => vi.fn(() => true));

vi.mock('../package', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../package')>()),
  handlePopupExportBuildPackageRuntime: handlePackage,
}));

import { createPopupExportRequestHandler } from './runtime';

it('preserves the validated full-page capability from unknown input into the package handler', () => {
  const runtime = {
    exportRunner: {
      buildBlobPackage: vi.fn(),
      buildPackage: vi.fn(),
      cancel: vi.fn(),
    },
    parseTree: vi.fn(),
    state: { activeExportRequestId: null, isExportRunning: false },
  };
  const sendResponse = vi.fn();
  const request = {
    batchRequestId: 'job-capability',
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: false,
    contentIntentGrant: { grantToken: 'grant-capability' },
    fullPageCaptureAction: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    includeWebCopy: true,
    intent: 'save',
    options: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: true,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
      includePageDiagnostics: false,
    },
    ordinal: 0,
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  } as const;

  const handleRequest = createPopupExportRequestHandler(runtime);

  expect(handleRequest(request, sendResponse)).toBe(true);
  expect(handlePackage).toHaveBeenCalledWith({
    ...runtime,
    request,
    sendResponse,
  });
});
