import type { createLogger } from '@sniptale/platform/observability/logger';

type AiStorageLogger = Pick<ReturnType<typeof createLogger>, 'warn'>;

export function warnAboutInvalidAiStoragePayload(args: {
  logger: AiStorageLogger;
  storageKey: string;
  message?: string;
}): void {
  args.logger.warn(args.message ?? 'Ignoring invalid AI storage payload root', {
    storageKey: args.storageKey,
  });
}

export function warnAboutInvalidAiStorageEntries(args: {
  logger: AiStorageLogger;
  storageKey: string;
  invalidEntryCount: number;
  hasInvalidRoot: boolean;
}): void {
  if (args.hasInvalidRoot) {
    warnAboutInvalidAiStoragePayload({
      logger: args.logger,
      storageKey: args.storageKey,
    });
  }

  if (args.invalidEntryCount > 0) {
    args.logger.warn('Dropped invalid AI storage entries', {
      storageKey: args.storageKey,
      invalidEntryCount: args.invalidEntryCount,
    });
  }
}
