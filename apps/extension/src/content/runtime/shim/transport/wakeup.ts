import type { MessageType as RuntimeMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { resolveShimTransportDeps, type ShimTransportDeps } from './shared';

const CONTENT_RUNTIME_WAKEUP = 'CONTENT_RUNTIME_WAKEUP' satisfies RuntimeMessageType;

export function wakeContentRuntimeFromShim(deps?: ShimTransportDeps): Promise<unknown> {
  return resolveShimTransportDeps(deps).sendRuntimeMessage({
    type: CONTENT_RUNTIME_WAKEUP,
  });
}
