import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { createLogger } from '@sniptale/platform/observability/logger';
import { DEBUGGER_TIMEOUT_MS } from '../constants';
import { keepServiceWorkerAlive } from '../infra';

const logger = createLogger({ namespace: 'BackgroundDebuggerAttachRequest' });

type AttachAttempt = {
  completed: boolean;
  stopKeepAlive: () => void;
};

function finishAttachAttempt(
  attempt: AttachAttempt,
  timeoutId: ReturnType<typeof setTimeout>
): void {
  attempt.completed = true;
  clearTimeout(timeoutId);
  attempt.stopKeepAlive();
}

function rejectTimedOutAttach(attempt: AttachAttempt, reject: (reason?: unknown) => void): void {
  if (attempt.completed) {
    return;
  }

  attempt.completed = true;
  attempt.stopKeepAlive();
  logger.error('Debugger attach timed out', { timeoutMs: DEBUGGER_TIMEOUT_MS });
  reject(new Error(`Timeout (${DEBUGGER_TIMEOUT_MS}ms) during debugger.attach`));
}

function detachTimedOutAttachTarget(targetId: string): void {
  void browserDebugger.detach({ targetId }).catch((error) => {
    logger.error('Debugger detach after timed-out attach failed', error);
  });
}

export async function attachToPageTarget(targetId: string): Promise<void> {
  const stopKeepAlive = keepServiceWorkerAlive();
  const attempt: AttachAttempt = {
    completed: false,
    stopKeepAlive,
  };

  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => rejectTimedOutAttach(attempt, reject), DEBUGGER_TIMEOUT_MS);

    const finish = () => {
      finishAttachAttempt(attempt, timeoutId);
    };

    const handleAttachSuccess = () => {
      if (attempt.completed) {
        detachTimedOutAttachTarget(targetId);
        return;
      }

      finish();
      resolve();
    };

    const handleAttachError = (error: unknown) => {
      if (attempt.completed) {
        return;
      }

      logger.error('Debugger attach error', error);
      finish();
      reject(error);
    };

    Promise.resolve()
      .then(() => browserDebugger.attach({ targetId }, '1.3'))
      .then(handleAttachSuccess)
      .catch(handleAttachError);
  });
}
