import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  AGGREGATE_EDITOR_PRESENCE_PORT,
  type AggregateEditorClientMessage,
  type AggregateEditorServerMessage,
  type EditableAggregateRef,
} from '../../contracts/aggregate-promotion';

export function connectAggregateEditorPresence(args: {
  aggregate: EditableAggregateRef;
  promote: () => Promise<void>;
}): { dispose(): void } {
  let disconnectRequested = false;
  let port: chrome.runtime.Port | null = null;
  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const connect = () => {
    if (disconnectRequested) return;
    let nextPort: chrome.runtime.Port;
    try {
      nextPort = browserRuntime.connect({ name: AGGREGATE_EDITOR_PRESENCE_PORT });
    } catch {
      return;
    }
    port = nextPort;
    nextPort.postMessage({
      aggregate: args.aggregate,
      type: 'register',
    } satisfies AggregateEditorClientMessage);
    nextPort.onMessage.addListener((message: unknown) => {
      const request = parsePromotionRequest(message, args.aggregate);
      if (!request) return;
      const postResult = (result: AggregateEditorClientMessage) => {
        if (disconnectRequested || port !== nextPort) return;
        nextPort.postMessage(result);
      };
      void args.promote().then(
        () =>
          postResult({
            requestId: request.requestId,
            success: true,
            type: 'promotion-result',
          }),
        (error) =>
          postResult({
            error:
              error instanceof Error ? error.message : 'The editor could not save this project.',
            requestId: request.requestId,
            success: false,
            type: 'promotion-result',
          })
      );
    });
    nextPort.onDisconnect.addListener(() => {
      if (port === nextPort) port = null;
      if (!disconnectRequested) reconnectTimer = globalThis.setTimeout(connect, 250);
    });
  };

  connect();
  return {
    dispose() {
      disconnectRequested = true;
      if (reconnectTimer !== null) globalThis.clearTimeout(reconnectTimer);
      port?.disconnect();
      port = null;
    },
  };
}

function parsePromotionRequest(
  value: unknown,
  aggregate: EditableAggregateRef
): AggregateEditorServerMessage | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const rawAggregate = record['aggregate'];
  if (
    record['type'] !== 'promote' ||
    typeof record['requestId'] !== 'string' ||
    typeof rawAggregate !== 'object' ||
    rawAggregate === null ||
    Array.isArray(rawAggregate)
  ) {
    return null;
  }
  const ref = rawAggregate as Record<string, unknown>;
  return ref['id'] === aggregate.id && ref['kind'] === aggregate.kind
    ? { aggregate, requestId: record['requestId'], type: 'promote' }
    : null;
}
