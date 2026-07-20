import { getActiveTraceObserver } from './runtime';
import type { TraceConfig, TraceEvent, TraceLogLevel } from './types';
import { redactSensitiveString } from '../../security/secret-redaction';

export function recordConsoleTrace(namespace: string, level: TraceLogLevel, args: unknown[]): void {
  const observer = getActiveTraceObserver();
  if (!observer || !observer.config.enabled) {
    return;
  }

  const parts = buildConsolePayloadParts(
    args,
    observer.config,
    observer.sanitizeValue,
    observer.safeStringify
  );
  const event: TraceEvent = {
    kind: 'console',
    ts: new Date().toISOString(),
    ctx: observer.context,
    level,
    msg: `[${namespace}] ${parts.message}`.substring(0, observer.config.maxPayloadSize),
    ...(parts.data === undefined ? {} : { data: parts.data }),
  };

  const firstError = args.find((arg): arg is Error => arg instanceof Error);
  if (level === 'error' && firstError) {
    const sanitizedError = observer.sanitizeValue(firstError, observer.config);
    if (
      typeof sanitizedError === 'object' &&
      sanitizedError !== null &&
      'stack' in sanitizedError &&
      typeof sanitizedError.stack === 'string'
    ) {
      event.err = sanitizedError.stack;
    }
  }

  observer.sendEvent(event);
}

function buildConsolePayloadParts(
  args: unknown[],
  config: TraceConfig,
  sanitizeValue: (value: unknown, config: TraceConfig) => unknown,
  safeStringify: (value: unknown, config: TraceConfig) => string
) {
  const payloadParts = args.map((arg) => {
    if (typeof arg === 'string') return redactSensitiveString(arg, config.maxPayloadSize);
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    try {
      return safeStringify(sanitizeValue(arg, config), config);
    } catch {
      return String(arg);
    }
  });

  let data: unknown = undefined;
  const lastArg = args[args.length - 1];
  if (args.length > 1 && typeof lastArg === 'object') {
    data = sanitizeValue(lastArg, config);
  }

  return {
    message: payloadParts.join(' ').substring(0, config.maxPayloadSize),
    data,
  };
}
