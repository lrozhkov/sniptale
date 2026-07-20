export type StopFailureLogging = 'detailed' | 'fixed';

export interface StopFailureLogger {
  warn(...args: unknown[]): void;
}

export function resolveStopFailureLogger(
  mode: StopFailureLogging,
  logger: StopFailureLogger
): StopFailureLogger {
  if (mode === 'detailed') return logger;
  return {
    warn(message: unknown): void {
      logger.warn(typeof message === 'string' ? message : 'Recording stop cleanup failed');
    },
  };
}
