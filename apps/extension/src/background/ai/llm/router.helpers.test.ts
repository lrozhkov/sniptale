import { beforeEach, expect, it, vi } from 'vitest';

const { loggerDebugMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    child: vi.fn(),
    debug: loggerDebugMock,
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

import {
  createHistoryEntryArgs,
  logLLMRequest,
  resolveFailureHistoryErrorCode,
  resolveRequestKind,
} from './router.helpers';

beforeEach(() => {
  vi.clearAllMocks();
});

it('builds compact history args without undefined fields', () => {
  expect(
    createHistoryEntryArgs({
      errorCode: undefined,
      modelId: null,
      requestKind: 'json',
      resultCount: 1,
      status: undefined,
    })
  ).toEqual({
    requestKind: 'json',
    resultCount: 1,
  });
});

it('resolves request kinds and structured error messages', () => {
  expect(resolveRequestKind({ prompt: 'x', jsonData: '{}' })).toBe('json');
  expect(resolveRequestKind({ prompt: 'x', markdownData: '# hi' })).toBe('markdown');
  expect(resolveFailureHistoryErrorCode({ error: 'bad json' })).toBe('provider-invalid-response');
  expect(resolveFailureHistoryErrorCode(new Error('boom'))).toBe('provider-failure');
});

it('logs request shape without mutating payloads', () => {
  logLLMRequest({
    prompt: 'Normalize selected nodes',
    modelId: 'model-1',
    markdownData: '# hi',
  });

  expect(loggerDebugMock).toHaveBeenCalledWith('Processing LLM request', {
    hasJsonData: false,
    hasMarkdownData: true,
    modelId: 'model-1',
    promptLength: 24,
  });
});
