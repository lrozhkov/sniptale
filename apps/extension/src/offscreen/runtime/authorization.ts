import { authorizeOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { authorizeOffscreenRuntimeMessageFreshness } from './freshness';
import { authorizeOffscreenCommandRateLimit } from './rate-limit';
import { getUnauthorizedOffscreenCommandSenderReason } from './sender-policy';

type OffscreenRuntimeCommandAuthorization =
  | { authorized: true; capabilityGeneration: string; message: Record<string, unknown> }
  | { authorized: false; reason: string };

function rejectOffscreenRuntimeCommand(
  reason: string,
  responseHandler: ResponseSender | undefined
): OffscreenRuntimeCommandAuthorization {
  responseHandler?.({ success: false, error: reason });
  return { authorized: false, reason };
}

export function authorizeOffscreenRuntimeCommand(args: {
  message: unknown;
  nowEpochMs?: number;
  responseHandler?: ResponseSender;
  sender: chrome.runtime.MessageSender | undefined;
}): OffscreenRuntimeCommandAuthorization {
  const senderReason = getUnauthorizedOffscreenCommandSenderReason(args.sender);
  if (senderReason) {
    return rejectOffscreenRuntimeCommand(senderReason, args.responseHandler);
  }

  const freshness = authorizeOffscreenRuntimeMessageFreshness({
    message: args.message,
    sender: args.sender,
    ...(args.nowEpochMs === undefined ? {} : { nowEpochMs: args.nowEpochMs }),
  });
  if (!freshness.authorized) {
    return rejectOffscreenRuntimeCommand(freshness.reason, args.responseHandler);
  }

  const capability = authorizeOffscreenCommandCapability(
    freshness.message,
    args.nowEpochMs ?? Date.now()
  );
  if (!capability.authorized) {
    return rejectOffscreenRuntimeCommand(capability.reason, args.responseHandler);
  }

  const rateLimit = authorizeOffscreenCommandRateLimit({
    message: freshness.message,
    sender: args.sender,
    ...(args.nowEpochMs === undefined ? {} : { nowEpochMs: args.nowEpochMs }),
  });
  if (!rateLimit.authorized) {
    return rejectOffscreenRuntimeCommand(rateLimit.reason, args.responseHandler);
  }

  return {
    authorized: true,
    capabilityGeneration: capability.generation,
    message: freshness.message,
  };
}
