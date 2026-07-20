import {
  sanitizeDiagnosticData,
  sanitizeDiagnosticMessage,
  stringifyDiagnosticValue,
} from '@sniptale/platform/observability/diagnostics/sanitizer';

import { CONSOLE_LEVELS, pushEntry } from './state';
import type {
  ConsoleDiagnosticLevel,
  ConsoleDiagnosticsState,
  ConsoleMethod,
  ConsoleTarget,
} from './types';

function buildConsoleMessage(args: unknown[]): string {
  return sanitizeDiagnosticMessage(args.map((arg) => stringifyDiagnosticValue(arg)).join(' '));
}

function buildConsoleData(args: unknown[]): unknown {
  const objectArgs = args.filter((arg) => typeof arg === 'object' && arg !== null);
  if (objectArgs.length === 0) {
    return undefined;
  }

  return sanitizeDiagnosticData(objectArgs.at(-1));
}

export function installConsoleMethodCapture(props: {
  consoleTarget: ConsoleTarget;
  getNow: () => string;
  level: ConsoleDiagnosticLevel;
  maxEntries: number;
  state: ConsoleDiagnosticsState;
}): void {
  const originalMethod = props.consoleTarget[props.level] as ConsoleMethod;
  props.state.originalMethods[props.level] = originalMethod;

  props.consoleTarget[props.level] = ((...args: unknown[]) => {
    pushEntry(props.state, props.maxEntries, {
      kind: 'console',
      level: props.level,
      message: buildConsoleMessage(args),
      timestamp: props.getNow(),
      data: buildConsoleData(args),
    });

    originalMethod.apply(props.consoleTarget, args);
  }) as ConsoleTarget[typeof props.level];
}

export function restoreConsoleMethods(
  state: ConsoleDiagnosticsState,
  consoleTarget: ConsoleTarget
): void {
  CONSOLE_LEVELS.forEach((level) => {
    const originalMethod = state.originalMethods[level];
    if (!originalMethod) {
      return;
    }

    consoleTarget[level] = originalMethod as ConsoleTarget[typeof level];
  });
}
