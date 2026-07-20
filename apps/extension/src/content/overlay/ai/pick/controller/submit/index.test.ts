// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createAiSubmitRequestGate } from './gate';

const {
  applyAiResponseChangesMock,
  formatDataForAIJSONMock,
  requestAiResponseMock,
  showToastMock,
} = vi.hoisted(() => ({
  applyAiResponseChangesMock: vi.fn(),
  formatDataForAIJSONMock: vi.fn(),
  requestAiResponseMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: showToastMock,
}));

vi.mock('../../../../../parser/dom-tree-parser/ai/format', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../parser/dom-tree-parser/ai/format')>()),
  formatDataForAIJSON: formatDataForAIJSONMock,
}));

vi.mock('./request', () => ({
  requestAiResponse: requestAiResponseMock,
}));

vi.mock('./apply', () => ({
  applyAiResponseChanges: applyAiResponseChangesMock,
}));

import { submitAiPickPrompt } from '.';

function createTree(): ParsedDOMTree {
  return {
    context: 'test',
    structure: [{ children: [], id: 'section-1', title: 'Section', type: 'section' }],
    title: 'AI Pick',
  };
}

function createContext(treeData: ParsedDOMTree | null = createTree()) {
  return {
    isAILoading: false,
    requestGate: createAiSubmitRequestGate(),
    setIsAILoading: vi.fn(),
    setIsAIModalOpen: vi.fn(),
    setTreeData: vi.fn(),
    treeData,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  formatDataForAIJSONMock.mockReturnValue('{"field":"value"}');
  requestAiResponseMock.mockResolvedValue('{"changes":[]}');
  applyAiResponseChangesMock.mockResolvedValue(undefined);
});

async function expectBlankPromptRejection() {
  const context = createContext();

  await submitAiPickPrompt(context, '   ');

  expect(showToastMock).toHaveBeenCalledWith('content.toolbar.aiPromptRequired', 'warning');
  expect(context.setIsAILoading).not.toHaveBeenCalled();
  expect(requestAiResponseMock).not.toHaveBeenCalled();
}

async function expectMissingTreeRejection() {
  const context = createContext(null);

  await submitAiPickPrompt(context, 'Summarize selected fields', undefined, 'model-1');

  expect(showToastMock).toHaveBeenCalledWith('content.toolbar.aiNoData', 'error');
  expect(requestAiResponseMock).not.toHaveBeenCalled();
}

async function expectMissingModelRejection() {
  const context = createContext();

  await submitAiPickPrompt(context, 'Summarize selected fields');

  expect(showToastMock).toHaveBeenCalledWith('background.runtime.llmModelMissing', 'warning');
  expect(requestAiResponseMock).not.toHaveBeenCalled();
}

async function expectSuccessfulSubmission() {
  const context = createContext();

  await submitAiPickPrompt(context, 'Summarize selected fields', '{"selected":true}', 'model-1');

  expect(context.setIsAILoading).toHaveBeenNthCalledWith(1, true);
  expect(formatDataForAIJSONMock).not.toHaveBeenCalled();
  expect(requestAiResponseMock).toHaveBeenCalledWith({
    jsonData: '{"selected":true}',
    modelId: 'model-1',
    prompt: 'Summarize selected fields',
  });
  expect(applyAiResponseChangesMock).toHaveBeenCalledWith(
    '{"changes":[]}',
    context.treeData,
    context,
    1
  );
  expect(context.setIsAILoading).toHaveBeenLastCalledWith(false);
}

async function expectRequestFailureWithSelectedData() {
  const context = createContext();
  requestAiResponseMock.mockRejectedValue(new Error('boom'));

  await submitAiPickPrompt(context, 'Summarize selected fields', '{"selected":true}', 'model-1');

  expect(formatDataForAIJSONMock).not.toHaveBeenCalled();
  expect(requestAiResponseMock).toHaveBeenCalledWith({
    jsonData: '{"selected":true}',
    modelId: 'model-1',
    prompt: 'Summarize selected fields',
  });
  expect(applyAiResponseChangesMock).not.toHaveBeenCalled();
  expect(showToastMock).toHaveBeenCalledWith('content.toolbar.aiErrorPrefix boom', 'error');
  expect(context.setIsAILoading).toHaveBeenLastCalledWith(false);
}

async function expectLateCancelledResponseToBeIgnored() {
  const context = createContext();
  const responseController = {
    resolve: (_value: string) => {},
  };

  requestAiResponseMock.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        responseController.resolve = resolve;
      })
  );

  const submitPromise = submitAiPickPrompt(
    context,
    'Summarize selected fields',
    '{"selected":true}',
    'model-1'
  );

  context.requestGate.cancel();
  responseController.resolve('{"changes":[]}');
  await submitPromise;

  expect(applyAiResponseChangesMock).not.toHaveBeenCalled();
  expect(showToastMock).not.toHaveBeenCalledWith(expect.stringContaining('aiErrorPrefix'), 'error');
  expect(context.setIsAILoading).toHaveBeenCalledTimes(1);
}

describe('submitAiPickPrompt', () => {
  it('rejects blank prompts before loading starts', expectBlankPromptRejection);

  it('rejects missing tree data before sending the runtime message', expectMissingTreeRejection);

  it('rejects submissions that do not have a selected model', expectMissingModelRejection);

  it(
    'requests ai output for selected data, applies changes, and clears loading',
    expectSuccessfulSubmission
  );

  it(
    'prefers selected data over formatting and still clears loading on request failure',
    expectRequestFailureWithSelectedData
  );

  it(
    'ignores a late response after the active request was cancelled',
    expectLateCancelledResponseToBeIgnored
  );
});
