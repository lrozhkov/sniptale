import {
  type RuntimeMessageFreshness,
  splitRuntimeMessageFreshness,
} from './runtime-message-freshness';

const DEFAULT_RUNTIME_MESSAGE_FRESHNESS_TTL_MS = 2 * 60 * 1000;
const DEFAULT_RUNTIME_MESSAGE_FUTURE_SKEW_MS = 30 * 1000;
const DEFAULT_RUNTIME_MESSAGE_NONCE_CACHE_MAX_ENTRIES = 4_096;
const DEFAULT_RUNTIME_MESSAGE_NONCE_CACHE_MAX_ENTRIES_PER_SCOPE = 256;

type RuntimeMessageFreshnessAuthorization =
  | { authorized: true; message: Record<string, unknown> }
  | { authorized: false; reason: string };
type RuntimeMessageFreshnessConsumption =
  | { authorized: true }
  | { authorized: false; reason: string };

export type RuntimeMessageFreshnessConsumeHandle = {
  cacheKey: string;
  expiresAtEpochMs: number;
  scope: string;
};

type RuntimeMessageFreshnessInspection =
  | {
      authorized: true;
      consumeHandle: RuntimeMessageFreshnessConsumeHandle;
      message: Record<string, unknown>;
    }
  | { authorized: false; reason: string };

type RuntimeMessageFreshnessAuthorizer = {
  authorize(args: {
    message: unknown;
    nowEpochMs?: number;
    scope: string;
  }): RuntimeMessageFreshnessAuthorization;
  consume(args: {
    handle: RuntimeMessageFreshnessConsumeHandle;
    nowEpochMs?: number;
  }): RuntimeMessageFreshnessConsumption;
  inspect(args: {
    message: unknown;
    nowEpochMs?: number;
    scope: string;
  }): RuntimeMessageFreshnessInspection;
  resetForTests(): void;
};

type AcceptedRuntimeMessageNonce = {
  expiresAtEpochMs: number;
  scope: string;
};

type RuntimeMessageFreshnessAuthorizerState = {
  acceptedNonces: Map<string, AcceptedRuntimeMessageNonce>;
  futureSkewMs: number;
  maxEntries: number;
  maxEntriesPerScope: number;
  ttlMs: number;
};

function pruneExpiredRuntimeMessageNonces(
  acceptedNonces: Map<string, AcceptedRuntimeMessageNonce>,
  nowEpochMs: number
): void {
  for (const [cacheKey, record] of acceptedNonces) {
    if (record.expiresAtEpochMs <= nowEpochMs) {
      acceptedNonces.delete(cacheKey);
    }
  }
}

function countRuntimeMessageNoncesForScope(
  acceptedNonces: Map<string, AcceptedRuntimeMessageNonce>,
  scope: string
): number {
  let entriesForScope = 0;
  for (const record of acceptedNonces.values()) {
    if (record.scope === scope) {
      entriesForScope += 1;
    }
  }
  return entriesForScope;
}

function canRecordRuntimeMessageNonce(args: {
  acceptedNonces: Map<string, AcceptedRuntimeMessageNonce>;
  maxEntries: number;
  maxEntriesPerScope: number;
  scope: string;
}): boolean {
  return (
    args.acceptedNonces.size < args.maxEntries &&
    countRuntimeMessageNoncesForScope(args.acceptedNonces, args.scope) < args.maxEntriesPerScope
  );
}

function isFreshRuntimeMessage(
  freshness: RuntimeMessageFreshness,
  nowEpochMs: number,
  ttlMs: number,
  futureSkewMs: number
): boolean {
  return (
    freshness.issuedAtEpochMs <= nowEpochMs + futureSkewMs &&
    freshness.issuedAtEpochMs + ttlMs > nowEpochMs
  );
}

function inspectRuntimeMessageFreshness(args: {
  message: unknown;
  nowEpochMs: number;
  scope: string;
  state: RuntimeMessageFreshnessAuthorizerState;
}): RuntimeMessageFreshnessInspection {
  pruneExpiredRuntimeMessageNonces(args.state.acceptedNonces, args.nowEpochMs);
  const split = splitRuntimeMessageFreshness(args.message);
  if (!split.valid) {
    return { authorized: false, reason: split.reason };
  }
  if (
    !isFreshRuntimeMessage(
      split.freshness,
      args.nowEpochMs,
      args.state.ttlMs,
      args.state.futureSkewMs
    )
  ) {
    return { authorized: false, reason: 'Stale runtime message freshness' };
  }

  const cacheKey = `${args.scope}|nonce:${split.freshness.nonce}`;
  if (args.state.acceptedNonces.has(cacheKey)) {
    return { authorized: false, reason: 'Runtime message replay detected' };
  }

  return {
    authorized: true,
    consumeHandle: {
      cacheKey,
      expiresAtEpochMs: split.freshness.issuedAtEpochMs + args.state.ttlMs,
      scope: args.scope,
    },
    message: split.message,
  };
}

function consumeRuntimeMessageFreshness(args: {
  handle: RuntimeMessageFreshnessConsumeHandle;
  nowEpochMs: number;
  state: RuntimeMessageFreshnessAuthorizerState;
}): RuntimeMessageFreshnessConsumption {
  pruneExpiredRuntimeMessageNonces(args.state.acceptedNonces, args.nowEpochMs);
  if (args.handle.expiresAtEpochMs <= args.nowEpochMs) {
    return { authorized: false, reason: 'Stale runtime message freshness' };
  }
  if (args.state.acceptedNonces.has(args.handle.cacheKey)) {
    return { authorized: false, reason: 'Runtime message replay detected' };
  }
  if (
    !canRecordRuntimeMessageNonce({
      acceptedNonces: args.state.acceptedNonces,
      maxEntries: args.state.maxEntries,
      maxEntriesPerScope: args.state.maxEntriesPerScope,
      scope: args.handle.scope,
    })
  ) {
    return { authorized: false, reason: 'Runtime message freshness cache exhausted' };
  }

  args.state.acceptedNonces.set(args.handle.cacheKey, {
    expiresAtEpochMs: args.handle.expiresAtEpochMs,
    scope: args.handle.scope,
  });
  return { authorized: true };
}

export function createRuntimeMessageFreshnessAuthorizer(
  args: {
    futureSkewMs?: number;
    maxAcceptedNonces?: number;
    maxAcceptedNoncesPerScope?: number;
    ttlMs?: number;
  } = {}
): RuntimeMessageFreshnessAuthorizer {
  const state: RuntimeMessageFreshnessAuthorizerState = {
    acceptedNonces: new Map<string, AcceptedRuntimeMessageNonce>(),
    futureSkewMs: args.futureSkewMs ?? DEFAULT_RUNTIME_MESSAGE_FUTURE_SKEW_MS,
    maxEntries: Math.max(
      1,
      args.maxAcceptedNonces ?? DEFAULT_RUNTIME_MESSAGE_NONCE_CACHE_MAX_ENTRIES
    ),
    maxEntriesPerScope: Math.max(
      1,
      args.maxAcceptedNoncesPerScope ?? DEFAULT_RUNTIME_MESSAGE_NONCE_CACHE_MAX_ENTRIES_PER_SCOPE
    ),
    ttlMs: args.ttlMs ?? DEFAULT_RUNTIME_MESSAGE_FRESHNESS_TTL_MS,
  };

  return {
    authorize({ message, nowEpochMs = Date.now(), scope }) {
      const inspected = this.inspect({ message, nowEpochMs, scope });
      if (!inspected.authorized) {
        return inspected;
      }
      const consumed = this.consume({ handle: inspected.consumeHandle, nowEpochMs });
      return consumed.authorized ? { authorized: true, message: inspected.message } : consumed;
    },
    consume({ handle, nowEpochMs = Date.now() }) {
      return consumeRuntimeMessageFreshness({ handle, nowEpochMs, state });
    },
    inspect({ message, nowEpochMs = Date.now(), scope }) {
      return inspectRuntimeMessageFreshness({ message, nowEpochMs, scope, state });
    },
    resetForTests() {
      state.acceptedNonces.clear();
    },
  };
}
