import { createCaptureRouteContext } from './context';
import { routeDownloadMessage } from './download-adapter';
import { routeExportMessage } from './export-adapter';
import { routeGalleryMessage } from './gallery-adapter';
import { routeQuickActionMessage } from './quick-action-adapter';
import { routeScreenshotCaptureMessage } from './screenshot-adapter';
import type { CaptureRouteAdapterContext, RouteCaptureMessageArgs } from './types';
import { routeWebSnapshotMessage } from './web-snapshot-adapter';

export function routeCaptureMessage(routeArgs: RouteCaptureMessageArgs): boolean {
  const adapterContext: CaptureRouteAdapterContext = {
    context: createCaptureRouteContext(routeArgs),
    routeArgs,
  };

  return (
    routeExportMessage(routeArgs) ||
    routeScreenshotCaptureMessage(adapterContext) ||
    routeQuickActionMessage(adapterContext) ||
    routeDownloadMessage(routeArgs) ||
    routeGalleryMessage(routeArgs) ||
    routeWebSnapshotMessage(routeArgs)
  );
}
