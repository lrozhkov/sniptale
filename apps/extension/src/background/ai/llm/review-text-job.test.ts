import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReviewTextJobService } from './review-text-job';
import {
  REVIEW_TEXT_TIMEOUT_MS,
  REVIEW_TEXT_SYSTEM_PROMPT,
  type ReviewTextStart,
  type ReviewTextServerMessage,
} from '../../../contracts/ai/review-text';

const start = {
  type: 'start',
  requestId: '6403111a-85e3-4b64-8c89-0d64feb910dc',
  modelId: 'model',
  approvedProviderId: 'provider',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  approvedModelCode: 'code',
  llmSessionToken: 'token',
  scope: { workspaceId: 'private-workspace', workspaceRevision: 1 },
  context: {
    version: 1,
    prompt: 'Shorten',
    mode: 'phrases',
    wholeDocument: false,
    changeIntervals: false,
    resegment: false,
    window: { start: 1, end: 2 },
    fragments: [{ id: 'text', text: 'Authored words', start: 1, end: 2 }],
  },
} satisfies ReviewTextStart;
const proposal = { version: 1, fragments: [{ fromIds: ['text'], text: 'Short words' }] };
const config = {
  modelId: 'model',
  providerId: 'provider',
  baseUrl: 'https://provider.test/v1',
  apiKey: 'private-key',
  modelCode: 'code',
  connectionType: 'openai-compatible' as const,
  destinationBinding: 'fixture-destination-binding',
  effectiveSystemPrompt: 'hidden prompt must not be sent',
};
function setup() {
  type Dependencies = Required<NonNullable<Parameters<typeof createReviewTextJobService>[0]>>;
  const deps = {
    authorize: vi.fn<Dependencies['authorize']>(async () => undefined),
    assertScope: vi.fn<Dependencies['assertScope']>(async () => undefined),
    resolveModel: vi.fn<Dependencies['resolveModel']>(async () => config),
    request: vi.fn<Dependencies['request']>(async () => JSON.stringify(proposal)),
    history: vi.fn<Dependencies['history']>(async () => undefined),
  };
  const service = createReviewTextJobService(deps);
  const messages: ReviewTextServerMessage[] = [];
  const connection = service.connect({ documentId: 'document' }, (message) =>
    messages.push(message)
  );
  return { service, connection, messages, deps };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => vi.useRealTimers());

describe('one-shot cancellable text editing jobs', () => {
  it('sends only the disclosed context and fixed instructions, rechecking scope/model before one POST', async () => {
    const { service, connection, messages, deps } = setup();
    connection.receive(start);
    const reservation = service.reserveErasureExclusion();
    await reservation.waitForActiveMutations();
    reservation.release();
    expect(deps.authorize).toHaveBeenCalledOnce();
    expect(deps.assertScope).toHaveBeenCalledTimes(2);
    expect(deps.resolveModel).toHaveBeenCalledTimes(2);
    expect(deps.request).toHaveBeenCalledOnce();
    expect(deps.request).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: REVIEW_TEXT_SYSTEM_PROMPT,
        userPrompt: JSON.stringify(start.context),
        modelCode: 'code',
        signal: expect.any(AbortSignal),
      })
    );
    expect(JSON.stringify(deps.request.mock.calls[0]?.[0])).not.toContain(start.scope.workspaceId);
    expect(deps.history).toHaveBeenCalledWith({
      modelId: 'model',
      requestKind: 'json',
      resultCount: 1,
    });
    expect(messages.at(-1)).toEqual({ type: 'proposal', requestId: start.requestId, proposal });
    connection.receive(start);
    expect(deps.request).toHaveBeenCalledOnce();
    await connection.disconnect();
  });
  it.each(['authorize', 'resolveModel', 'assertScope'] as const)(
    'refuses failures in %s before POST with safe diagnostics',
    async (phase) => {
      const { connection, deps, service, messages } = setup();
      deps[phase].mockRejectedValueOnce(new Error('private provider detail'));
      connection.receive(start);
      const reservation = service.reserveErasureExclusion();
      await reservation.waitForActiveMutations();
      reservation.release();
      expect(deps.request).not.toHaveBeenCalled();
      expect(messages.at(-1)).toEqual({
        type: 'failure',
        requestId: start.requestId,
        code: 'provider-failed',
      });
    }
  );
  it('cancels before asynchronous authorization resolves, preventing secret activation and POST', async () => {
    const { service, connection, deps, messages } = setup();
    const wait = deferred();
    deps.authorize.mockImplementationOnce(async () => wait.promise);
    connection.receive(start);
    connection.receive({ type: 'cancel', requestId: start.requestId });
    expect(messages.at(-1)).toEqual({
      type: 'failure',
      requestId: start.requestId,
      code: 'cancelled',
    });
    wait.resolve();
    await service.cancelActiveJob();
    expect(deps.resolveModel).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });
  it('ignores late provider results after cancellation and blocks new jobs while erasure drai...', async () => {
    const { service, connection, deps, messages } = setup();
    const wait = deferred();
    deps.request.mockImplementationOnce(async () => {
      await wait.promise;
      return JSON.stringify(proposal);
    });
    connection.receive(start);
    await vi.waitFor(() => expect(deps.request).toHaveBeenCalledOnce());
    const reservation = service.reserveErasureExclusion();
    const blocked: ReviewTextServerMessage[] = [];
    service
      .connect({}, (message) => blocked.push(message))
      .receive({ ...start, requestId: 'cb1ac84a-7fea-4e90-9d51-851137c9bb71' });
    expect(blocked.at(-1)?.type).toBe('failure');
    let settled = false;
    const cancellation = service.cancelActiveJob().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    wait.resolve();
    await cancellation;
    await reservation.waitForActiveMutations();
    reservation.release();
    reservation.release();
    expect(messages.some((message) => message.type === 'proposal')).toBe(false);
    expect(deps.history).not.toHaveBeenCalled();
    const retryMessages: ReviewTextServerMessage[] = [];
    service.connect({}, (message) => retryMessages.push(message)).receive(start);
    await vi.waitFor(() => expect(retryMessages.at(-1)?.type).toBe('proposal'));
  });
  it('disconnects during preparation without a late POST or second start on that connection', async () => {
    const { service, connection, deps, messages } = setup();
    const wait = deferred();
    deps.resolveModel.mockImplementationOnce(async () => {
      await wait.promise;
      return config;
    });
    connection.receive(start);
    await vi.waitFor(() => expect(deps.resolveModel).toHaveBeenCalledOnce());
    const disconnected = connection.disconnect();
    wait.resolve();
    await disconnected;
    connection.receive(start);
    await service.cancelActiveJob();
    expect(deps.request).not.toHaveBeenCalled();
    expect(messages.some((message) => message.type === 'proposal')).toBe(false);
  });
  it('reports a deadline immediately even while authorization is pending and no resumes the p...', async () => {
    vi.useFakeTimers();
    const { connection, deps, messages, service } = setup();
    const wait = deferred();
    deps.authorize.mockImplementationOnce(async () => wait.promise);
    connection.receive(start);
    await vi.advanceTimersByTimeAsync(REVIEW_TEXT_TIMEOUT_MS);
    expect(messages.at(-1)).toEqual({
      type: 'failure',
      requestId: start.requestId,
      code: 'timeout',
    });
    wait.resolve();
    await service.cancelActiveJob();
    expect(deps.request).not.toHaveBeenCalled();
  });
  it.each([
    'not JSON',
    JSON.stringify({ ...proposal, audio: 'private' }),
    JSON.stringify({ ...proposal, fragments: [{ fromIds: ['other'], text: 'Wrong' }] }),
  ])(
    'refuses malformed or unauthorized provider output without persisting text or raw diagnostics',
    async (content) => {
      const { connection, deps, service, messages } = setup();
      deps.request.mockResolvedValueOnce(content);
      connection.receive(start);
      const reservation = service.reserveErasureExclusion();
      await reservation.waitForActiveMutations();
      reservation.release();
      expect(messages.at(-1)).toEqual({
        type: 'failure',
        requestId: start.requestId,
        code: 'invalid-response',
      });
      expect(deps.history).toHaveBeenCalledWith({
        modelId: 'model',
        requestKind: 'json',
        resultCount: 0,
        status: 'failure',
        errorCode: 'provider-failure',
      });
    }
  );
});

it('ignores another cancellation and admits only one review start on a connection', async () => {
  const h = setup();
  const pending = deferred();
  h.deps.authorize.mockReturnValueOnce(pending.promise);
  h.connection.receive(start);
  h.connection.receive({ type: 'keepalive', requestId: start.requestId });
  h.connection.receive({ type: 'cancel', requestId: 'another-request' });
  expect(h.deps.authorize.mock.calls[0]?.[2]?.aborted).toBe(false);
  h.connection.receive(start);
  expect(h.messages.at(-1)).toMatchObject({ type: 'failure', code: 'invalid-request' });
  pending.resolve();
  await h.service.reserveErasureExclusion().waitForActiveMutations();
  expect(h.deps.request).toHaveBeenCalledOnce();
  expect(h.messages.at(-1)?.type).toBe('proposal');
});

it('keeps review erasure reservations local to a service and releases each only once', async () => {
  const first = setup();
  const second = setup();
  const released = first.service.reserveErasureExclusion();
  released.release();
  released.release();
  const held = first.service.reserveErasureExclusion();
  first.connection.receive(start);
  second.connection.receive(start);
  await second.service.reserveErasureExclusion().waitForActiveMutations();
  expect(first.messages.at(-1)).toMatchObject({ type: 'failure', code: 'invalid-request' });
  expect(second.messages.at(-1)?.type).toBe('proposal');
  held.release();
  first.connection.receive(start);
  await first.service.reserveErasureExclusion().waitForActiveMutations();
  expect(first.messages.at(-1)?.type).toBe('proposal');
});

it('rechecks the current model and workspace at the transport send boundary', async () => {
  const { connection, deps, service, messages } = setup();
  deps.request.mockImplementationOnce(async ({ beforeSend }) => {
    await beforeSend?.();
    return JSON.stringify(proposal);
  });
  connection.receive(start);
  const reservation = service.reserveErasureExclusion();
  await reservation.waitForActiveMutations();
  reservation.release();
  expect(deps.resolveModel).toHaveBeenCalledTimes(3);
  expect(deps.assertScope).toHaveBeenCalledTimes(3);
  expect(messages.at(-1)).toEqual({ type: 'proposal', requestId: start.requestId, proposal });
});

it.each(['model-change', 'workspace-change'] as const)(
  'refuses %s after transport preparation before sending review text',
  async (change) => {
    const { connection, deps, service, messages } = setup();
    const send = vi.fn();
    deps.request.mockImplementationOnce(async ({ beforeSend }) => {
      if (change === 'model-change') {
        deps.resolveModel.mockResolvedValueOnce({ ...config, modelCode: 'replacement' });
      } else {
        deps.assertScope.mockRejectedValueOnce(new Error('stale'));
      }
      await beforeSend?.();
      send();
      return JSON.stringify(proposal);
    });
    connection.receive(start);
    const reservation = service.reserveErasureExclusion();
    await reservation.waitForActiveMutations();
    reservation.release();
    expect(send).not.toHaveBeenCalled();
    expect(messages.at(-1)).toEqual({
      type: 'failure',
      requestId: start.requestId,
      code: change === 'model-change' ? 'model-unavailable' : 'stale',
    });
    expect(deps.history).toHaveBeenCalledExactlyOnceWith({
      modelId: 'model',
      requestKind: 'json',
      resultCount: 0,
      status: 'failure',
      errorCode: 'provider-failure',
    });
  }
);
