import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), request: vi.fn() }));
vi.mock('./model-config', () => ({ resolveModelConfig: mocks.resolve }));
vi.mock('./transport/request', () => ({ requestChatCompletion: mocks.request }));
import { correctVoiceTranscript } from './voice-correction';
const selection = {
  modelId: 'model',
  approvedProviderId: 'provider',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  approvedModelCode: 'text',
};
const config = {
  providerId: 'provider',
  modelId: 'model',
  baseUrl: 'https://example.test/v1',
  modelCode: 'text',
  apiKey: 'fixture',
  effectiveSystemPrompt: 'Unrelated global prompt',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolve.mockResolvedValue(config);
  mocks.request.mockImplementation(async (args) => {
    await args.beforeSend();
    return 'Corrected words';
  });
});
function run(beforeSend: () => Promise<void> = vi.fn(async () => {})) {
  return correctVoiceTranscript({
    selection,
    transcript: 'Raw words',
    prompt: 'Keep my meaning',
    signal: new AbortController().signal,
    beforeSend,
  });
}
it('sends only dictated text and the dedicated prompt through the pinned provider', async () => {
  const beforeSend = vi.fn(async () => {});
  await expect(run(beforeSend)).resolves.toBe('Corrected words');
  expect(mocks.request).toHaveBeenCalledWith(
    expect.objectContaining({
      userPrompt: 'Raw words',
      systemPrompt: 'Keep my meaning',
      rejectTruncated: true,
    })
  );
  expect(mocks.resolve).toHaveBeenCalledTimes(2);
  expect(beforeSend).toHaveBeenCalledOnce();
});
it('refuses an asynchronously changed secret before final egress admission', async () => {
  mocks.resolve
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce({ ...config, apiKey: 'replacement' });
  const admission = vi.fn(async () => {});
  await expect(run(admission)).rejects.toThrow('model-unavailable');
  expect(admission).not.toHaveBeenCalled();
  expect(mocks.request).toHaveBeenCalledOnce();
});
it('propagates stale source admission without replacing it with corrected text', async () => {
  await expect(
    run(async () => {
      throw new Error('stale');
    })
  ).rejects.toThrow('stale');
});
it.each(['', '   '])('refuses empty corrected output %j', async (text) => {
  mocks.request.mockResolvedValue(text);
  await expect(run()).rejects.toThrow('invalid-response');
});
it('refuses cancelled text without model or network work', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    correctVoiceTranscript({
      selection,
      transcript: 'Raw',
      prompt: 'Correct',
      signal: controller.signal,
      beforeSend: async () => {},
    })
  ).rejects.toThrow();
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});
