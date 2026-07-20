import { createRouteErrorResponse } from '../../../../routing-contracts/response';
import { routePopupRecordingControlWithoutTabId } from '../video-control';
import { routeResolvedCaptureMessage } from './capture-adapter';
import { routeResolvedPageStyleMessage } from './page-style-adapter';
import { routeResolvedPopupExportMessage } from './popup-export-adapter';
import { routeResolvedScenarioMessage } from './scenario-adapter';
import { routeResolvedTabModeMessage } from './tab-mode-adapter';
import { normalizeResolvedTabMessage, rejectMissingResolvedTabId } from './tab-id';
import type { ResolvedTabRouteArgs, UnresolvedTabRouteArgs } from './types';
import { routeResolvedVideoControlMessage } from './video-control-adapter';

export function routeAuthorizedTabAction(args: UnresolvedTabRouteArgs): void {
  if (routePopupRecordingControlWithoutTabId(args)) {
    return;
  }

  if (rejectMissingResolvedTabId(args)) {
    return;
  }

  const { resolvedTabId } = args;
  if (typeof resolvedTabId !== 'number') {
    return;
  }

  const message = normalizeResolvedTabMessage(args.message, resolvedTabId);
  const resolvedArgs: ResolvedTabRouteArgs = {
    ...args,
    message,
    resolvedTabId,
  };

  if (routeResolvedTabMessage(resolvedArgs)) {
    return;
  }

  args.logger.warn('Unhandled background tab message type', { type: message.type });
  args.sendResponse(createRouteErrorResponse('Unknown message type'));
}

function routeResolvedTabMessage(args: ResolvedTabRouteArgs): boolean {
  return (
    routeResolvedPopupExportMessage(args) ||
    routeResolvedTabModeMessage(args) ||
    routeResolvedPageStyleMessage(args) ||
    routeResolvedScenarioMessage(args) ||
    routeResolvedCaptureMessage(args) ||
    routeResolvedVideoControlMessage(args)
  );
}
