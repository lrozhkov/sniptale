import type { CaptureRouteContext } from '../types';
import type { RouteCaptureMessageArgs } from './types';

export function createCaptureRouteContext(args: RouteCaptureMessageArgs): CaptureRouteContext {
  return {
    message: args.message as NonNullable<CaptureRouteContext['message']>,
    resolvedTabId: args.resolvedTabId,
    sendResponse: args.sendResponse,
    viewportState: args.viewportState,
    screenshotModeState: args.screenshotModeState,
    captureGuardState: args.captureGuardState,
    pageAccessPort: args.pageAccessPort,
    scenarioSessionService: args.scenarioSessionService,
    webSnapshotViewerPorts: args.webSnapshotViewerPorts,
  };
}
