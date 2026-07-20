import { useCallback, useEffect, useRef } from 'react';
import { translate } from '../../../platform/i18n';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import type { ViewerPopupExportMessage } from '../../../workflows/page-preparation';
import {
  createPreparationPopupExportController,
  handlePreparationPopupExportRequest,
  type PreparationPageSnapshotSource,
  type PreparationPopupSendResponse,
} from '../../../content/public/preparation-surface';

function resolveSourceHostname(sourceUrl: string | null | undefined, fallbackDocument: Document) {
  if (sourceUrl) {
    try {
      return new URL(sourceUrl).hostname;
    } catch {
      // Fall back to the iframe document location below.
    }
  }

  return fallbackDocument.location.hostname;
}

function createViewerPageSnapshotSource(
  iframe: HTMLIFrameElement | null,
  manifest: WebSnapshotManifest
): PreparationPageSnapshotSource {
  const targetDocument = iframe?.contentDocument ?? null;
  const targetBody = targetDocument?.body ?? null;
  if (!targetDocument || !targetBody) {
    throw new Error(translate('content.runtime.exportPrepareFailed'));
  }

  const sourceUrl = manifest.source.url ?? targetDocument.location.href;
  const sourceTitle = manifest.source.title ?? targetDocument.title;

  return {
    document: targetDocument,
    pageHostname: resolveSourceHostname(sourceUrl, targetDocument),
    pageTitle: sourceTitle,
    pageUrl: sourceUrl,
    root: targetBody,
  };
}

export function createViewerPopupExportController(args: {
  iframe: HTMLIFrameElement | null;
  manifest: WebSnapshotManifest;
}) {
  return createPreparationPopupExportController({
    resolveSnapshotSource: () => createViewerPageSnapshotSource(args.iframe, args.manifest),
  });
}

export function handleViewerPopupExportRequest(args: {
  controller: ReturnType<typeof createViewerPopupExportController> | null;
  request: ViewerPopupExportMessage;
  sendResponse: PreparationPopupSendResponse;
}): void {
  handlePreparationPopupExportRequest(args);
}

export function useViewerPopupExportHandler(
  iframe: HTMLIFrameElement | null,
  manifest: WebSnapshotManifest
) {
  const controllerRef = useRef<ReturnType<typeof createViewerPopupExportController> | null>(null);

  useEffect(() => {
    const controller = createViewerPopupExportController({ iframe, manifest });
    controllerRef.current = controller;

    return () => {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      controller.dispose();
    };
  }, [iframe, manifest]);

  return useCallback(
    (request: ViewerPopupExportMessage, sendResponse: PreparationPopupSendResponse) => {
      handleViewerPopupExportRequest({
        controller: controllerRef.current,
        request,
        sendResponse,
      });
    },
    []
  );
}
