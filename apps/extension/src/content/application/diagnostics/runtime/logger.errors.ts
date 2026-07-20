import type { DiagnosticEventFromCS } from '@sniptale/platform/observability/diagnostics/types';

type DiagnosticLoggerErrorState = {
  isEnabled: boolean;
};

export type DiagnosticErrorHandlers = {
  handleUnhandledRejection: (event: PromiseRejectionEvent) => void;
  handleWindowError: (event: ErrorEvent) => void;
};

function getDiagnosticErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack?.slice(0, 500) : undefined;
}

export function createDiagnosticErrorHandlers(args: {
  sendEvent: (event: Omit<DiagnosticEventFromCS, 'tsMs'>) => void;
  state: DiagnosticLoggerErrorState;
}): DiagnosticErrorHandlers {
  return {
    handleWindowError(event: ErrorEvent) {
      if (!args.state.isEnabled) {
        return;
      }

      args.sendEvent({
        kind: 'error',
        level: 'error',
        message: event.message || 'Unknown error',
        data: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: getDiagnosticErrorStack(event.error),
        },
      });
    },

    handleUnhandledRejection(event: PromiseRejectionEvent) {
      if (!args.state.isEnabled) {
        return;
      }

      const reason: unknown = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection';
      const stack = reason instanceof Error ? reason.stack?.slice(0, 500) : undefined;

      args.sendEvent({
        kind: 'error',
        level: 'error',
        message,
        data: { stack },
      });
    },
  };
}
