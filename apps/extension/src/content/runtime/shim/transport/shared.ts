import { sendContentRuntimeShimMessage } from '@sniptale/platform/ports/runtime-messaging/content-runtime-shim';

export type ShimTransportDeps = {
  requestId?: () => string;
  sendRuntimeMessage?: (message: Record<string, unknown>) => Promise<unknown>;
};

export type ShimTransportRuntimeDeps = {
  requestId: () => string;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
};

function createDefaultRequestId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) {
    throw new Error('Content runtime shim request id generation is unavailable.');
  }

  return randomUUID.call(globalThis.crypto);
}

export function resolveShimTransportDeps(deps: ShimTransportDeps = {}): ShimTransportRuntimeDeps {
  return {
    requestId: deps.requestId ?? createDefaultRequestId,
    sendRuntimeMessage: deps.sendRuntimeMessage ?? sendContentRuntimeShimMessage,
  };
}

function isSuccessRecord(value: unknown): value is Record<string, unknown> & { success: true } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { success?: unknown }).success === true
  );
}

function getResponseError(value: unknown, fallback: string): string {
  if (typeof value === 'object' && value !== null && 'error' in value) {
    const error = value.error;
    return typeof error === 'string' ? error : fallback;
  }

  return fallback;
}

export function requireShimSuccess(response: unknown, fallback: string): Record<string, unknown> {
  if (!isSuccessRecord(response)) {
    throw new Error(getResponseError(response, fallback));
  }

  return response;
}
