import type {
  ActiveDiagnosticsSession,
  DiagnosticLevel,
} from '@sniptale/platform/observability/diagnostics/types';
import { isObjectRecord, isOptionalStringRecord } from './cdp-record-guards';

export interface ConsoleAPICalledEvent {
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: Array<{ value?: unknown; description?: string }>;
  executionContextId: number;
  timestamp: number;
  stackTrace?: { callFrames: Array<{ functionName: string; url: string; lineNumber: number }> };
}

export function isConsoleAPICalledEvent(params: unknown): params is ConsoleAPICalledEvent {
  if (!isObjectRecord(params) || !Array.isArray(params['args'])) {
    return false;
  }

  return (
    typeof params['type'] === 'string' &&
    typeof params['executionContextId'] === 'number' &&
    typeof params['timestamp'] === 'number'
  );
}

export interface ExceptionThrownEvent {
  exceptionDetails: {
    text: string;
    exception?: { description?: string };
    stackTrace?: { callFrames: Array<{ functionName: string; url: string; lineNumber: number }> };
    lineNumber?: number;
    columnNumber?: number;
    url?: string;
  };
}

export function isExceptionThrownEvent(params: unknown): params is ExceptionThrownEvent {
  return (
    isObjectRecord(params) &&
    isObjectRecord(params['exceptionDetails']) &&
    typeof params['exceptionDetails']['text'] === 'string'
  );
}

export interface RequestWillBeSentEvent {
  requestId: string;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
  timestamp: number;
  type?: string;
}

export function isRequestWillBeSentEvent(params: unknown): params is RequestWillBeSentEvent {
  return (
    isObjectRecord(params) &&
    isObjectRecord(params['request']) &&
    typeof params['requestId'] === 'string' &&
    typeof params['request']['url'] === 'string' &&
    typeof params['request']['method'] === 'string' &&
    isOptionalStringRecord(params['request']['headers']) &&
    typeof params['timestamp'] === 'number' &&
    (params['type'] === undefined || typeof params['type'] === 'string')
  );
}

export interface ResponseReceivedEvent {
  requestId: string;
  response: {
    url: string;
    status: number;
    statusText: string;
    mimeType?: string;
  };
  timestamp: number;
}

export function isResponseReceivedEvent(params: unknown): params is ResponseReceivedEvent {
  return (
    isObjectRecord(params) &&
    isObjectRecord(params['response']) &&
    typeof params['requestId'] === 'string' &&
    typeof params['response']['url'] === 'string' &&
    typeof params['response']['status'] === 'number' &&
    typeof params['response']['statusText'] === 'string' &&
    typeof params['timestamp'] === 'number' &&
    (params['response']['mimeType'] === undefined ||
      typeof params['response']['mimeType'] === 'string')
  );
}

export interface LoadingFailedEvent {
  requestId: string;
  errorText: string;
  timestamp: number;
}

export function isLoadingFailedEvent(params: unknown): params is LoadingFailedEvent {
  return (
    isObjectRecord(params) &&
    typeof params['requestId'] === 'string' &&
    typeof params['errorText'] === 'string' &&
    typeof params['timestamp'] === 'number'
  );
}

export type MaybeFlush = (session: ActiveDiagnosticsSession) => void;

export function mapConsoleType(type: string): DiagnosticLevel {
  switch (type) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warn';
    case 'info':
      return 'info';
    default:
      return 'log';
  }
}
