import * as runtimeFreshness from '@sniptale/platform/security/runtime-message-freshness-authorizer';

type ConsumeHandle = runtimeFreshness.RuntimeMessageFreshnessConsumeHandle;

type RuntimeMessageFreshnessAuthorization =
  | { authorized: true; message: Record<string, unknown> }
  | { authorized: false; reason: string };
type RuntimeMessageFreshnessInspection =
  | {
      authorized: true;
      consumeHandle: ConsumeHandle;
      message: Record<string, unknown>;
    }
  | { authorized: false; reason: string };
type RuntimeMessageFreshnessConsumption =
  | { authorized: true }
  | { authorized: false; reason: string };

const runtimeMessageFreshnessAuthorizer =
  runtimeFreshness.createRuntimeMessageFreshnessAuthorizer();

function resolveSenderScope(sender: chrome.runtime.MessageSender): string {
  const tabScope = sender.tab?.id === undefined ? 'tab:none' : `tab:${sender.tab.id}`;
  const frameScope = sender.frameId === undefined ? 'frame:none' : `frame:${sender.frameId}`;
  const documentScope =
    typeof sender.documentId === 'string' && sender.documentId.length > 0
      ? `doc:${sender.documentId}`
      : 'doc:none';
  const urlScope =
    typeof sender.url === 'string' && sender.url.length > 0 ? sender.url : 'url:none';
  return `${tabScope}|${frameScope}|${documentScope}|${urlScope}`;
}

export function authorizeRuntimeMessageFreshness(args: {
  message: unknown;
  nowEpochMs?: number;
  sender: chrome.runtime.MessageSender;
}): RuntimeMessageFreshnessAuthorization {
  return runtimeMessageFreshnessAuthorizer.authorize({
    message: args.message,
    scope: resolveSenderScope(args.sender),
    ...(args.nowEpochMs === undefined ? {} : { nowEpochMs: args.nowEpochMs }),
  });
}

export function inspectRuntimeMessageFreshness(args: {
  message: unknown;
  nowEpochMs?: number;
  sender: chrome.runtime.MessageSender;
}): RuntimeMessageFreshnessInspection {
  return runtimeMessageFreshnessAuthorizer.inspect({
    message: args.message,
    scope: resolveSenderScope(args.sender),
    ...(args.nowEpochMs === undefined ? {} : { nowEpochMs: args.nowEpochMs }),
  });
}

export function consumeRuntimeMessageFreshness(args: {
  handle: Extract<RuntimeMessageFreshnessInspection, { authorized: true }>['consumeHandle'];
  nowEpochMs?: number;
}): RuntimeMessageFreshnessConsumption {
  return runtimeMessageFreshnessAuthorizer.consume({
    handle: args.handle,
    ...(args.nowEpochMs === undefined ? {} : { nowEpochMs: args.nowEpochMs }),
  });
}

export function resetRuntimeMessageFreshnessForTests(): void {
  runtimeMessageFreshnessAuthorizer.resetForTests();
}
