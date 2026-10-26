import type { MessageType as RuntimeMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { isPageCorner, type PageCorner } from '../../../../contracts/page-launch';
import {
  requireShimSuccess,
  resolveShimTransportDeps,
  requestShimContentIntent,
  type ShimTransportDeps,
} from './shared';
export async function openPageToolbarFromShim(deps?: ShimTransportDeps): Promise<void> {
  const resolved = resolveShimTransportDeps(deps);
  const contentIntent = await requestShimContentIntent(
    resolved,
    'ENABLE_SCREENSHOT_MODE',
    resolved.requestId()
  );
  requireShimSuccess(
    await resolved.sendRuntimeMessage({
      type: 'ENABLE_SCREENSHOT_MODE' satisfies RuntimeMessageType,
      contentIntent,
    }),
    'Page toolbar could not be opened'
  );
}
export async function savePageCornerFromShim(
  corner: PageCorner,
  deps?: ShimTransportDeps
): Promise<PageCorner> {
  const response = requireShimSuccess(
    await resolveShimTransportDeps(deps).sendRuntimeMessage({
      type: 'PAGE_LAUNCH_PREFERENCES' satisfies RuntimeMessageType,
      corner,
    }),
    'Page corner could not be saved'
  );
  const accepted: unknown = response['corner'];
  if (!isPageCorner(accepted)) throw new Error('Page corner response is unavailable');
  return accepted;
}
