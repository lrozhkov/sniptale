export type ConsoleDiagnosticLevel = 'debug' | 'error' | 'info' | 'log' | 'warn';
export type ConsoleMethod = (...args: unknown[]) => void;
export type ConsoleTarget = Pick<Console, ConsoleDiagnosticLevel>;

export type ConsoleDiagnosticEntry = {
  kind: 'console' | 'error' | 'unhandledrejection';
  level: ConsoleDiagnosticLevel | 'error';
  message: string;
  timestamp: string;
  data?: unknown;
};

export type ConsoleDiagnosticsSnapshot = {
  capturedAt: string;
  droppedCount: number;
  entries: ConsoleDiagnosticEntry[];
};

export interface ConsoleDiagnosticsCaptureController {
  dispose: () => void;
  getSnapshot: () => ConsoleDiagnosticsSnapshot;
  install: () => void;
}

export interface ConsoleDiagnosticsCaptureDeps {
  consoleTarget?: ConsoleTarget;
  getNow?: () => string;
  maxEntries?: number;
  windowTarget?: Window | null;
}

export type ConsoleDiagnosticsState = {
  droppedCount: number;
  entries: ConsoleDiagnosticEntry[];
  isInstalled: boolean;
  originalMethods: Partial<Record<ConsoleDiagnosticLevel, ConsoleMethod>>;
  windowHandlers: {
    handleUnhandledRejection: (event: PromiseRejectionEvent) => void;
    handleWindowError: (event: ErrorEvent) => void;
  } | null;
};
