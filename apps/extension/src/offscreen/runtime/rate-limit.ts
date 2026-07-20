import { createOffscreenCommandBinding } from '@sniptale/platform/security/offscreen-command-capability';

const OFFSCREEN_COMMAND_RATE_LIMIT_WINDOW_MS = 60_000;
const OFFSCREEN_COMMAND_RATE_LIMIT_MAX = 60;

type OffscreenCommandRateLimitEntry = {
  count: number;
  windowStartedAtEpochMs: number;
};

const commandRateLimits = new Map<string, OffscreenCommandRateLimitEntry>();

function resolveOffscreenCommandRateLimitSenderScope(
  sender: chrome.runtime.MessageSender | undefined
): string {
  return [
    sender?.id ?? 'unknown-extension',
    sender?.url ?? 'unknown-url',
    sender?.documentId ?? 'unknown-document',
  ].join('|');
}

function pruneOffscreenCommandRateLimits(nowEpochMs: number): void {
  for (const [key, entry] of commandRateLimits) {
    if (entry.windowStartedAtEpochMs + OFFSCREEN_COMMAND_RATE_LIMIT_WINDOW_MS <= nowEpochMs) {
      commandRateLimits.delete(key);
    }
  }
}

export function authorizeOffscreenCommandRateLimit(args: {
  message: Record<string, unknown>;
  nowEpochMs?: number;
  sender: chrome.runtime.MessageSender | undefined;
}): { authorized: true } | { authorized: false; reason: string } {
  const nowEpochMs = args.nowEpochMs ?? Date.now();
  pruneOffscreenCommandRateLimits(nowEpochMs);

  const key = [
    resolveOffscreenCommandRateLimitSenderScope(args.sender),
    args.message['type'],
    createOffscreenCommandBinding(args.message),
  ].join('|');
  const existing = commandRateLimits.get(key);
  if (
    existing &&
    existing.windowStartedAtEpochMs + OFFSCREEN_COMMAND_RATE_LIMIT_WINDOW_MS > nowEpochMs
  ) {
    if (existing.count >= OFFSCREEN_COMMAND_RATE_LIMIT_MAX) {
      return { authorized: false, reason: 'Offscreen command rate limit exceeded' };
    }
    existing.count += 1;
    return { authorized: true };
  }

  commandRateLimits.set(key, { count: 1, windowStartedAtEpochMs: nowEpochMs });
  return { authorized: true };
}

export const OFFSCREEN_COMMAND_RATE_LIMIT_MAX_FOR_TESTS = OFFSCREEN_COMMAND_RATE_LIMIT_MAX;
