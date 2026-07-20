import { captureFullPageTransaction } from '../index';
import { runGuardedCapture } from './guard';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { CaptureRouteContext } from './types';
import { runPreparedCaptureAction } from './handlers.shared';

export function handleFullCapture(context: CaptureRouteContext): boolean {
  runGuardedCapture(context.captureGuardState, () =>
    runPreparedCaptureAction({
      context,
      captureTarget: 'full',
      capture: () => captureFullPageTransaction(context.resolvedTabId),
    })
  ).catch((error) => context.sendResponse(createRouteErrorResponse(error)));
  return true;
}
