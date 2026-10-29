import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestTextReplacement } from './request';
import { CHROME_AI_MODEL_ID } from '../../../../features/ai/chrome/constants';
import {
  CONTENT_TEXT_MAX_CHARS,
  CONTENT_TEXT_TIMEOUT_MS,
} from '../../../../contracts/ai/content-text';
import type { AIModel } from '../../../../contracts/settings';
import type { AIProviderSelectorEntry } from '../../../../contracts/messaging/ai-settings-runtime';
import { createContentAiEgressAuthority } from '../../../../features/ai/egress-authority';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  token: vi.fn(),
  run: vi.fn(),
  configured: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/chrome-ai', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/browser/chrome-ai')>()),
  createChromeAiSession: mocks.create,
}));
vi.mock('../../../../workflows/ai-settings/query', async (original) => ({
  ...(await original<typeof import('../../../../workflows/ai-settings/query')>()),
  requestChromeAiContentSystemPrompt: mocks.configured,
}));
vi.mock('../../../../workflows/ai-session/llm-session', () => ({
  requestLlmSessionToken: mocks.token,
}));
vi.mock('../../../../workflows/ai-session/content-text', () => ({ runContentTextJob: mocks.run }));
const model: AIModel = {
  id: 'model',
  providerId: 'provider',
  modelCode: 'code',
  displayName: 'Text model',
};
const provider: AIProviderSelectorEntry = {
  id: 'provider',
  name: 'Provider',
  connectionType: 'openai-compatible',
  createdAt: 1,
  hasStoredApiKey: true,
  destinationKind: 'external',
  destinationBinding: `sha256:${'a'.repeat(64)}`,
};
function args(chrome = false) {
  return {
    text: 'Original selected text',
    prompt: 'Shorten',
    sourceOrigin: 'https://page.test',
    model: chrome ? { ...model, id: CHROME_AI_MODEL_ID } : model,
    provider: chrome ? undefined : provider,
    signal: new AbortController().signal,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.token.mockResolvedValue('content-token');
  mocks.run.mockResolvedValue('<b>Literal replacement</b>');
  mocks.configured.mockResolvedValue('Configured system instruction');
});
afterEach(() => vi.useRealTimers());
it('binds the normalized selected text to the existing content capability and approved destination', async () => {
  const input = args();
  input.text = '{"password":"source-secret","visible":"Words"}';
  await expect(requestTextReplacement(input)).resolves.toBe('<b>Literal replacement</b>');
  const start = mocks.run.mock.calls[0]?.[0];
  expect(start.text).not.toContain('source-secret');
  expect(start.text).toContain('Words');
  expect(start).toMatchObject({
    approvedProviderId: provider.id,
    approvedDestination: provider.destinationBinding,
    approvedModelCode: model.modelCode,
    llmSessionToken: 'content-token',
  });
  const authority = await createContentAiEgressAuthority({
    payload: { markdownData: start.text },
    privacyProof: start.privacyProof,
  });
  expect(mocks.token).toHaveBeenCalledExactlyOnceWith('content-ai-pick', authority);
  expect(mocks.create).not.toHaveBeenCalled();
});
it('refuses excessive source text or a missing provider before a paid request', async () => {
  await expect(
    requestTextReplacement({ ...args(), text: 'x'.repeat(CONTENT_TEXT_MAX_CHARS + 1) })
  ).rejects.toThrow('too-large');
  await expect(requestTextReplacement({ ...args(), provider: undefined })).rejects.toThrow(
    'model-unavailable'
  );
  expect(mocks.run).not.toHaveBeenCalled();
  expect(mocks.token).not.toHaveBeenCalled();
});
it('does not open a provider Port when Stop occurs during token admission', async () => {
  const entered = deferred<void>();
  const token = deferred<string>();
  mocks.token.mockImplementationOnce(() => {
    entered.resolve();
    return token.promise;
  });
  const controller = new AbortController();
  const result = requestTextReplacement({ ...args(), signal: controller.signal });
  const stopped = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await entered.promise;
  controller.abort();
  token.resolve('late-token');
  await stopped;
  expect(mocks.run).not.toHaveBeenCalled();
});
it('uses plain local text with configured system instruction and destroys the browser session', async () => {
  const session = {
    prompt: vi.fn(async (_input: unknown) => 'Local replacement'),
    destroy: vi.fn(),
  };
  mocks.create.mockResolvedValue(session);
  const input = args(true);
  input.prompt = 'Use Authorization: Bearer prompt-secret';
  await expect(requestTextReplacement(input)).resolves.toBe('Local replacement');
  expect(mocks.create.mock.calls[0]?.[0].initialPrompts[0].content).toContain(
    'Configured system instruction'
  );
  expect(session.prompt.mock.calls[0]?.[0]).not.toContain('prompt-secret');
  expect(session.destroy).toHaveBeenCalledOnce();
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
});
it('destroys an acquired Chrome session and rejects a late local response after Stop', async () => {
  const entered = deferred<void>();
  const response = deferred<string>();
  const session = {
    prompt: vi.fn(() => {
      entered.resolve();
      return response.promise;
    }),
    destroy: vi.fn(),
  };
  mocks.create.mockResolvedValue(session);
  const controller = new AbortController();
  const result = requestTextReplacement({ ...args(true), signal: controller.signal });
  const stopped = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await entered.promise;
  controller.abort();
  await stopped;
  expect(session.destroy).toHaveBeenCalledOnce();
  response.resolve('Late local response');
  await Promise.resolve();
  expect(session.destroy).toHaveBeenCalledOnce();
});
it('releases a Chrome session that arrives after cancellation during creation', async () => {
  const entered = deferred<void>();
  const creating = deferred<{
    prompt: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>();
  mocks.create.mockImplementationOnce(() => {
    entered.resolve();
    return creating.promise;
  });
  const controller = new AbortController();
  const result = requestTextReplacement({ ...args(true), signal: controller.signal });
  const stopped = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await entered.promise;
  controller.abort();
  await stopped;
  const session = { prompt: vi.fn(), destroy: vi.fn() };
  creating.resolve(session);
  await creating.promise;
  await Promise.resolve();
  expect(session.prompt).not.toHaveBeenCalled();
  expect(session.destroy).toHaveBeenCalledOnce();
});
it('enforces a local deadline and releases the browser session without applying a response', async () => {
  vi.useFakeTimers();
  const entered = deferred<void>();
  const response = deferred<string>();
  const session = {
    prompt: vi.fn(() => {
      entered.resolve();
      return response.promise;
    }),
    destroy: vi.fn(),
  };
  mocks.create.mockResolvedValue(session);
  const result = requestTextReplacement(args(true));
  const expired = expect(result).rejects.toThrow('timeout');
  await entered.promise;
  await vi.advanceTimersByTimeAsync(CONTENT_TEXT_TIMEOUT_MS);
  await expired;
  expect(session.destroy).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  response.resolve('Late response');
});

it.each(['anthropic', 'google', 'neuraldeep', 'ollama', 'openrouter'] as const)(
  'sends the approved %s selection through the existing external content workflow',
  async (connectionType) => {
    const input = { ...args(), provider: { ...provider, connectionType } };
    await expect(requestTextReplacement(input)).resolves.toBe('<b>Literal replacement</b>');
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: model.id,
        approvedProviderId: provider.id,
        approvedDestination: provider.destinationBinding,
        approvedModelCode: model.modelCode,
      }),
      input.signal
    );
    expect(mocks.create).not.toHaveBeenCalled();
  }
);
it('refuses a disabled external provider before capability or inference admission', async () => {
  await expect(
    requestTextReplacement({ ...args(), provider: { ...provider, enabled: false } })
  ).rejects.toThrow('model-unavailable');
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
