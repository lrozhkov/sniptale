import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestChatCompletion } from './request';

const { admit, commit } = vi.hoisted(() => ({ admit: vi.fn(), commit: vi.fn() }));
vi.mock('../../../../composition/persistence/ai-settings/graph-mutations', () => ({
  admitStoredAIOperation: admit,
  commitStoredAIOperation: commit,
}));
const binding = {
  providerId: 'p',
  incarnation: 'i',
  revision: 1,
  credentialRevision: 2,
  destination: 'sha256:test',
};
const token = { ...binding, generation: 'g' };
const fetchMock = vi.fn();
const options = {
  baseUrl: 'https://example.com/v1',
  apiKey: 'private-key-canary',
  modelCode: 'fixture',
  systemPrompt: 'private-system-canary',
  userPrompt: 'private-user-canary',
  observationBinding: binding,
};
function success() {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { role: 'assistant', content: 'Accepted result' }, finish_reason: 'stop' },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  admit.mockResolvedValue(token);
  commit.mockResolvedValue(true);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async () => success());
});
afterEach(() => vi.unstubAllGlobals());

it('publishes only success metadata after an admitted paid request', async () => {
  const beforeSend = vi.fn().mockResolvedValue(undefined);
  await expect(requestChatCompletion({ ...options, beforeSend })).resolves.toBe('Accepted result');
  expect(beforeSend).toHaveBeenCalledTimes(2);
  expect(admit).toHaveBeenCalledWith(binding);
  expect(commit).toHaveBeenCalledWith(token, { kind: 'success' });
  expect(JSON.stringify(commit.mock.calls)).not.toContain('private-');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('preserves fixed failure evidence without provider bodies or automatic retries', async () => {
  fetchMock.mockResolvedValue(new Response('private-provider-response-canary', { status: 401 }));
  await expect(requestChatCompletion(options)).rejects.toMatchObject({
    reason: 'invalid-credential',
  });
  expect(commit).toHaveBeenCalledWith(token, { kind: 'failure', reason: 'invalid-credential' });
  expect(JSON.stringify(commit.mock.calls)).not.toContain('private-');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not observe source admission refusal or dispatch a paid request', async () => {
  const failure = new Error('source-changed');
  await expect(
    requestChatCompletion({
      ...options,
      beforeSend: async () => {
        throw failure;
      },
    })
  ).rejects.toBe(failure);
  expect(admit).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('rechecks egress after advisory admission waits for a graph mutation', async () => {
  let release!: () => void;
  admit.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve(token);
      })
  );
  const beforeSend = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('model-unavailable'));
  const pending = requestChatCompletion({ ...options, beforeSend });
  const rejected = expect(pending).rejects.toThrow('model-unavailable');
  await vi.waitFor(() => expect(admit).toHaveBeenCalled());
  release();
  await rejected;
  expect(commit).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('cancellation retains priority and publishes no failure observation', async () => {
  const controller = new AbortController();
  fetchMock.mockImplementation(async () => {
    controller.abort();
    throw new DOMException('Cancelled', 'AbortError');
  });
  await expect(
    requestChatCompletion({ ...options, signal: controller.signal })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(commit).not.toHaveBeenCalled();
});

it('preserves accepted output when observation admission or publication fails', async () => {
  admit.mockRejectedValueOnce(new Error('Storage refused'));
  await expect(requestChatCompletion(options)).resolves.toBe('Accepted result');
  expect(commit).not.toHaveBeenCalled();
  commit.mockRejectedValueOnce(new Error('Storage refused'));
  await expect(requestChatCompletion(options)).resolves.toBe('Accepted result');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('preserves the original safe provider error when observation storage fails', async () => {
  commit.mockRejectedValueOnce(new Error('Storage refused'));
  fetchMock.mockResolvedValue(new Response('private-provider-response-canary', { status: 429 }));
  await expect(requestChatCompletion(options)).rejects.toMatchObject({ reason: 'rate-limited' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not write observations for an unbound transport request', async () => {
  const { observationBinding: _binding, ...unbound } = options;
  await expect(requestChatCompletion(unbound)).resolves.toBe('Accepted result');
  expect(admit).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});

it('does not classify an SDK deadline before native dispatch as a connection failure', async () => {
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  admit.mockImplementation(async () => {
    deadline.abort(new DOMException('Deadline', 'TimeoutError'));
    return token;
  });
  try {
    await expect(requestChatCompletion(options)).rejects.toBeInstanceOf(Error);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  } finally {
    timeout.mockRestore();
  }
});
