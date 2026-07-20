import { sendRuntimeMessage } from '../../platform/runtime-messaging/index';

type DebugLogger = {
  debug: (message: string, context?: Record<string, unknown>) => void;
};

export function stringifyOffscreenError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function logOffscreenDebugError(
  logger: DebugLogger,
  message: string,
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  logger.debug(message, {
    ...context,
    errorMessage: stringifyOffscreenError(error),
  });
}

export function sendRuntimeMessageBestEffort(params: {
  context?: Record<string, unknown>;
  logger: DebugLogger;
  logMessage: string;
  payload: Parameters<typeof sendRuntimeMessage>[0];
}): void {
  void sendRuntimeMessage(params.payload).catch((error) => {
    logOffscreenDebugError(params.logger, params.logMessage, error, params.context);
  });
}
