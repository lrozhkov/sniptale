export function warnAboutInvalidStoredState(args: {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  logger: {
    warn: (message: string, payload?: Record<string, number>) => void;
  };
}): void {
  if (args.hasInvalidRoot) {
    args.logger.warn('Ignoring invalid editor preset settings payload root from storage');
  }

  if (args.invalidFieldCount > 0) {
    args.logger.warn('Dropped invalid editor preset settings fields from storage', {
      invalidFieldCount: args.invalidFieldCount,
    });
  }
}
