import type { CaptureRouteContext } from '../types';
import type { CaptureRouteCommandArgs } from './types';

export function createCaptureRouteContext(args: CaptureRouteCommandArgs): CaptureRouteContext {
  return {
    ...(args.contentPreauthorization
      ? { contentPreauthorization: args.contentPreauthorization }
      : {}),
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
