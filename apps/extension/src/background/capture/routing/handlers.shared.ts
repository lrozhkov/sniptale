import type { CaptureActionType } from '../../../contracts/settings';
import { respondWithCaptureAction } from './delivery-response';
import type { CaptureRouteContext } from './types';
import { runStartCaptureUseCase } from '../application/start-capture-use-case';
import type { CaptureDeliveryPayload } from '../application/payload';

export { respondWithCaptureAction } from './delivery-response';
export {
  createCaptureDeliveryPromise,
  createVisibleCapturePromise,
  maybePersistScreenshotInMediaHub,
  resolveScenarioCaptureForAction,
} from '../application/start-capture-use-case';

function deliverPreparedCaptureAction(
  capturePromise: Promise<CaptureDeliveryPayload>,
  args: {
    context: CaptureRouteContext;
    captureAction: CaptureActionType;
    filename: string;
    defaultImagePresetId?: string | null | undefined;
  }
): Promise<void> {
  return respondWithCaptureAction(capturePromise, {
    resolvedTabId: args.context.resolvedTabId,
    sendResponse: args.context.sendResponse,
    captureAction: args.captureAction,
    filename: args.filename,
    defaultImagePresetId: args.defaultImagePresetId,
  });
}

export async function runPreparedCaptureAction(args: {
  context: CaptureRouteContext;
  captureTarget: 'full' | 'visible';
  capture: Parameters<typeof runStartCaptureUseCase>[0]['capture'];
}) {
  const result = await runStartCaptureUseCase({
    actionType: args.context.message?.actionType,
    capture: args.capture,
    captureTarget: args.captureTarget,
    resolvedTabId: args.context.resolvedTabId,
    scenarioCapture: args.context.message?.scenarioCapture,
    scenarioSessionService: args.context.scenarioSessionService,
  });

  await deliverPreparedCaptureAction(Promise.resolve(result.payload), {
    context: args.context,
    captureAction: result.captureAction,
    filename: result.filename,
    defaultImagePresetId: result.defaultImagePresetId,
  });
}
