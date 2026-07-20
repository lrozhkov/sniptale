import * as RuntimeFreshness from '@sniptale/platform/security/runtime-message-freshness-authorizer';

const offscreenRuntimeMessageFreshnessAuthorizer =
  RuntimeFreshness.createRuntimeMessageFreshnessAuthorizer();

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
    message: args.message,
    scope: resolveOffscreenSenderScope(args.sender),
    ...(args.nowEpochMs === undefined ? {} : { nowEpochMs: args.nowEpochMs }),
  });
}
