import { recordConsoleTrace } from '../message-tracer/console';
import { SECRET_KEY_FRAGMENTS } from '../../security/secret-key-fragments';
import { redactSensitiveString } from '../../security/secret-redaction';
import { isTraceEnabled } from './trace-enabled';
import type { Logger } from './types';

const RELEASE_SILENCED_LEVELS = new Set<keyof Omit<Logger, 'child'>>(['debug', 'info', 'log']);

declare global {
  var __SNIPTALE_RELEASE_BUILD__: boolean | undefined;
}

type LogSink = Pick<Console, 'debug' | 'error' | 'info' | 'log' | 'warn'>;

interface CreateLoggerOptions {
  namespace: string;
  sink?: LogSink;
  traceEnabled?: boolean;
}

const LOGGER_SANITIZE_KEYS = SECRET_KEY_FRAGMENTS.map((pattern) => pattern.toLowerCase());
const LOGGER_MAX_PAYLOAD_SIZE = 1000;
const LOGGER_MAX_DEPTH = 5;

function sanitizeSinkString(value: string): string {
  return redactSensitiveString(value, LOGGER_MAX_PAYLOAD_SIZE);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeSinkValue(value: unknown, depth = 0): unknown {
  if (depth > LOGGER_MAX_DEPTH) {
    return '[max depth]';
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeSinkString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSinkValue(entry, depth + 1));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = { __proto__: null };

  for (const key of Object.keys(value)) {
    const entry = value[key];
    const lowerKey = key.toLowerCase();
    const shouldSanitize = LOGGER_SANITIZE_KEYS.some((pattern) => lowerKey.includes(pattern));
    sanitized[key] = shouldSanitize ? '***' : sanitizeSinkValue(entry, depth + 1);
  }

  return sanitized;
}

function sanitizeSinkArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    const sanitizedError = new Error(redactSensitiveString(arg.message, LOGGER_MAX_PAYLOAD_SIZE));
    sanitizedError.name = arg.name;
    if (arg.stack !== undefined) {
      sanitizedError.stack = redactSensitiveString(arg.stack, LOGGER_MAX_PAYLOAD_SIZE);
    }
    return sanitizedError;
  }

  return sanitizeSinkValue(arg);
}

function isReleaseBuild(): boolean {
  return globalThis.__SNIPTALE_RELEASE_BUILD__ === true;
}

function emit(
  sink: LogSink,
  namespace: string,
  level: keyof Omit<Logger, 'child'>,
  args: unknown[],
  traceEnabled: boolean
): void {
  if (isReleaseBuild() && RELEASE_SILENCED_LEVELS.has(level)) {
    return;
  }

  if (level === 'debug' && !traceEnabled) {
    return;
  }

  const sinkArgs = args.map(sanitizeSinkArg);
  recordConsoleTrace(namespace, level, sinkArgs);

  const prefix = `[${namespace}]`;
  if (level === 'info') {
    sink.info(prefix, ...sinkArgs);
    return;
  }

  sink[level](prefix, ...sinkArgs);
}

/**
 * Creates a lightweight namespaced logger. `debug` output is gated behind explicit trace
 * namespaces, and release builds silence routine `log`/`info`/`debug` output by default.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const sink = options.sink ?? console;
  const traceEnabled = options.traceEnabled ?? isTraceEnabled(options.namespace);

  return {
    debug(...args) {
      emit(sink, options.namespace, 'debug', args, traceEnabled);
    },

    error(...args) {
      emit(sink, options.namespace, 'error', args, traceEnabled);
    },

    info(...args) {
      emit(sink, options.namespace, 'info', args, traceEnabled);
    },

    log(...args) {
      emit(sink, options.namespace, 'log', args, traceEnabled);
    },

    warn(...args) {
      emit(sink, options.namespace, 'warn', args, traceEnabled);
    },

    child(scope) {
      return createLogger({
        namespace: `${options.namespace}:${scope}`,
        sink,
        traceEnabled,
      });
    },
  };
}
