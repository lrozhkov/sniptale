import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';

const { initializeAiStorageAccessMock, loadDefaultModelIdMock, loggerErrorMock } = vi.hoisted(
  () => ({
    initializeAiStorageAccessMock: vi.fn(),
    loadDefaultModelIdMock: vi.fn(),
    loggerErrorMock: vi.fn(),
  })
);

vi.mock('../../../composition/persistence/ai-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings')>()),

  loadDefaultModelId: loadDefaultModelIdMock,
  initializeAiStorageAccess: initializeAiStorageAccessMock,
}));

import {
  normalizeLlmRouteError,
  respondAsyncLlmRoute,
  resolveRequiredLlmModelId,
} from './route-response';

beforeEach(() => {
  vi.clearAllMocks();
  initializeAiStorageAccessMock.mockResolvedValue(undefined);
  loadDefaultModelIdMock.mockResolvedValue('model-default');
});

describe('route-response model resolution', () => {
  it('prefers the explicit model id over the stored default selection', async () => {
    await expect(resolveRequiredLlmModelId('model-explicit')).resolves.toBe('model-explicit');
    expect(initializeAiStorageAccessMock).not.toHaveBeenCalled();
    expect(loadDefaultModelIdMock).not.toHaveBeenCalled();
  });

  it('falls back to the stored default model id and rejects when nothing is configured', async () => {
    await expect(resolveRequiredLlmModelId()).resolves.toBe('model-default');
    expect(initializeAiStorageAccessMock).toHaveBeenCalledTimes(1);

    loadDefaultModelIdMock.mockResolvedValueOnce(null);
    await expect(resolveRequiredLlmModelId()).rejects.toThrow(
      translate('background.runtime.llmModelMissing')
    );
  });
});

describe('route-response normalization', () => {
  it('normalizes structured provider failures without exposing provider metadata', () => {
    expect(
      normalizeLlmRouteError({
        cleanedResponse: '{"broken":true}',
        error: 'Provider returned invalid JSON',
        parseError: 'Missing required fields',
        rawResponse: 'raw-output',
      })
    ).toEqual({
      error: 'Provider returned invalid JSON',
      success: false,
    });
  });

  it('omits provider metadata fields when a plain error has no structured payload', () => {
    expect(normalizeLlmRouteError(new Error('Plain route error'))).toEqual({
      error: 'Plain route error',
      success: false,
    });
  });
});

describe('route-response async sender', () => {
  it('logs and normalizes thrown route errors through the shared async response seam', async () => {
    const sendResponse = vi.fn();

    respondAsyncLlmRoute({
      work: Promise.reject(new Error('Vision is not supported by the selected model')),
      sendResponse,
      logger: { error: loggerErrorMock },
      failureLogMessage: 'Scenario editor LLM request failed',
    });

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'Vision is not supported by the selected model',
        success: false,
      });
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Scenario editor LLM request failed',
      expect.any(Error)
    );
  });
});
