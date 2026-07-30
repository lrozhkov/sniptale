import { routeToolbarAnnotationExportMessage } from '../../annotation-export/route';
import type { RouteCaptureMessageArgs } from './types';

export function routeAnnotationExportMessage(args: RouteCaptureMessageArgs): boolean {
  return routeToolbarAnnotationExportMessage({
    message: args.message,
    resolvedTabId: args.resolvedTabId,
    sendResponse: args.sendResponse,
  });
}
