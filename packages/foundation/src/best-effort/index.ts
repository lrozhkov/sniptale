interface BestEffortLogger {
  warn(...args: unknown[]): void;
}

function emitBestEffortWarning(
  logger: BestEffortLogger,
  message: string,
  meta: unknown,
  error: unknown
): void {
  if (meta === undefined) {
    logger.warn(message, error);
    return;
  }

  logger.warn(message, meta, error);
}

/**
 * Runs a fire-and-forget async operation while preserving fail-soft behavior with low-noise
 * warning output instead of silent swallowing.
 */
export function runBestEffort<TResult>(
  operation: Promise<TResult>,
  logger: BestEffortLogger,
  message: string,
  meta?: unknown
): void {
  void operation.catch((error) => {
    emitBestEffortWarning(logger, message, meta, error);
  });
}

/**
 * Awaits a cleanup-style async operation and converts failures into an intentional warning path.
 */
export async function awaitBestEffort<TResult>(
  operation: Promise<TResult>,
  logger: BestEffortLogger,
  message: string,
  meta?: unknown
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    emitBestEffortWarning(logger, message, meta, error);
  }
}
