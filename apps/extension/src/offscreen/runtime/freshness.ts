import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import * as RuntimeFreshness from '@sniptale/platform/security/runtime-message-freshness-authorizer';

const offscreenRuntimeMessageFreshnessAuthorizer =
  RuntimeFreshness.createRuntimeMessageFreshnessAuthorizer({
    maxAcceptedNoncesPerScope: 4096,
    reservedAcceptedNonces: 256,
  });

function resolveOffscreenSenderScope(sender: chrome.runtime.MessageSender | undefined): string {
  return [
    'offscreen-background',
    sender?.id ?? 'unknown-extension',
    sender?.url ?? 'unknown-url',
    sender?.documentId ?? 'unknown-document',
  ].join('|');
}

export function authorizeOffscreenRuntimeMessageFreshness(args: {
  message: unknown;
  nowEpochMs?: number;
  sender: chrome.runtime.MessageSender | undefined;
}) {
  return offscreenRuntimeMessageFreshnessAuthorizer.authorize({
    capacity: {
      reserved: !(
        isRecord(args.message) &&
        args.message['advisory'] === true &&
        (args.message['type'] === MessageType.OFFSCREEN_SYNC_INSPECT ||
          args.message['type'] === MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND)
      ),
    },
    message: args.message,
    scope: resolveOffscreenSenderScope(args.sender),
    ...(args.nowEpochMs === undefined ? {} : { nowEpochMs: args.nowEpochMs }),
  });
}
