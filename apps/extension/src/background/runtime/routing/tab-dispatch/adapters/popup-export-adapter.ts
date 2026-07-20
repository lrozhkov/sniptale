import { isPopupExportViewerMessage } from '../../message-guards/guards/tab';
import { routePopupExportMessage } from '../../boundary/popup-export-routing';
import type { ResolvedTabRouteArgs } from './types';

export function routeResolvedPopupExportMessage(args: ResolvedTabRouteArgs): boolean {
  if (!isPopupExportViewerMessage(args.message)) {
    return false;
  }

  routePopupExportMessage({
    ...args,
    message: args.message,
  });
  return true;
}
