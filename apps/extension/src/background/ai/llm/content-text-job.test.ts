import { afterEach, expect, it, vi } from 'vitest';
import { createContentTextJobService } from './content-text-job';
import { createAiPrivacyProof } from '../../../features/ai/privacy';
import {
  CONTENT_TEXT_MAX_CHARS,
  CONTENT_TEXT_TIMEOUT_MS,
  type ContentTextStart,
  type ContentTextServerMessage,
} from '../../../contracts/ai/content-text';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const config = {
  providerId: 'provider',
  modelId: 'model',
  baseUrl: 'https://provider.test/v1',
  apiKey: 'synthetic-key',
  modelCode: 'code',
  connectionType: 'openai-compatible' as const,
  destinationBinding: 'fixture-destination-binding',
  effectiveSystemPrompt: 'Preserve meaning.',
};
async function fixture() {
  const request: ContentTextStart = {
    type: 'start',
    requestId: 'be0e898c-dcdf-4a0c-8e99-83949774b5ab',
    text: 'Selected words',
    prompt: 'Shorten',
    modelId: 'model',
    approvedProviderId: 'provider',
    approvedModelCode: 'code',
    approvedDestination: `sha256:${'a'.repeat(64)}`,
    llmSessionToken: 'synthetic-token',
    privacyProof: await createAiPrivacyProof({
      captureMode: 'selected_editable',
      payload: { markdownData: 'Selected words' },
      riskClass: 'safe_text',
      userInitiatedAiExtraction: true,
    }),
  };
  const authorize = vi.fn(async (): Promise<void> => undefined);
  const resolveModel = vi.fn(async () => ({ ...config }));
  const history = vi.fn(async (): Promise<void> => undefined);
  const requestProvider = vi.fn<
    NonNullable<NonNullable<Parameters<typeof createContentTextJobService>[0]>['request']>
  >(async (options) => {
    await options.beforeSend?.();
    return 'Short words';
  });
  const service = createContentTextJobService({
    authorize,
    resolveModel,
    history,
    request: requestProvider,
  });
  const events: ContentTextServerMessage[] = [];
  const sender = { documentId: 'page' };
  const connection = service.connect(sender, (event) => events.push(event));
  return {
    request,
    authorize,
    resolveModel,
    history,
    requestProvider,
    service,
    events,
    sender,
    connection,
  };
}
afterEach(() => vi.useRealTimers());

it('returns literal text through the existing normalized transport and records metadata only', async () => {
  const h = await fixture();
  const saved = deferred<void>();
  h.history.mockImplementationOnce(async () => {
    saved.resolve();
  });
  h.requestProvider.mockImplementationOnce(async (options) => {
    await options.beforeSend?.();
    expect(options.systemPrompt).toContain('Preserve meaning.');
    expect(options.systemPrompt).toContain('Return only the replacement text.');
    expect(options.userPrompt).toContain(h.request.text);
    expect(options.userPrompt).toContain(h.request.prompt);
    expect(options.rejectTruncated).toBe(true);
    return '<b>Literal text</b>';
  });
  h.connection.receive(h.request);
  await saved.promise;
  await h.service.reserveErasureExclusion().waitForActiveMutations();
  expect(h.events.at(-1)).toEqual({
    type: 'result',
    requestId: h.request.requestId,
    text: '<b>Literal text</b>',
  });
  expect(h.resolveModel).toHaveBeenCalledTimes(2);
  expect(h.history).toHaveBeenCalledExactlyOnceWith({
    modelId: 'model',
    requestKind: 'markdown',
    resultCount: 1,
  });
});

it('owns cancellation before authorization settles and ignores a late authorization result', async () => {
  const h = await fixture();
  const authorization = deferred<void>();
  h.authorize.mockReturnValueOnce(authorization.promise);
  h.connection.receive(h.request);
  h.connection.receive({ type: 'cancel', requestId: '11111111-1111-4111-8111-111111111111' });
  expect(h.events.at(-1)?.type).toBe('progress');
  h.connection.receive({ type: 'cancel', requestId: h.request.requestId });
  expect(h.events.at(-1)).toMatchObject({ type: 'failure', code: 'cancelled' });
  authorization.resolve();
  await h.connection.disconnect();
  expect(h.requestProvider).not.toHaveBeenCalled();
  expect(h.history).not.toHaveBeenCalled();
});

it('aborts the actual request on disconnect and rejects its delayed response', async () => {
  const h = await fixture();
  const entered = deferred<AbortSignal>();
  const response = deferred<string>();
  h.requestProvider.mockImplementationOnce(async (options) => {
    entered.resolve(options.signal!);
    return response.promise;
  });
  h.connection.receive(h.request);
  const signal = await entered.promise;
  const draining = h.connection.disconnect();
  expect(signal.aborted).toBe(true);
  response.resolve('Late words');
  await draining;
  expect(h.events.some((event) => event.type === 'result')).toBe(false);
  expect(h.history).not.toHaveBeenCalled();
});

it('reserves erasure before cancellation and drains an acquired metadata write', async () => {
  const h = await fixture();
  const entered = deferred<void>();
  const writing = deferred<void>();
  h.history.mockImplementationOnce(async () => {
    entered.resolve();
    await writing.promise;
  });
  h.connection.receive(h.request);
  await entered.promise;
  const reservation = h.service.reserveErasureExclusion();
  let drained = false;
  const erasing = h.service.cancelActiveJob().then(() => {
    drained = true;
  });
  const waiting = reservation.waitForActiveMutations();
  const refused: ContentTextServerMessage[] = [];
  h.service.connect(h.sender, (event) => refused.push(event)).receive(h.request);
  expect(refused.at(-1)).toMatchObject({ type: 'failure', code: 'invalid-request' });
  await Promise.resolve();
  expect(drained).toBe(false);
  writing.resolve();
  await Promise.all([erasing, waiting]);
  expect(h.events.some((event) => event.type === 'result')).toBe(false);
  reservation.release();
  const retried: ContentTextServerMessage[] = [];
  h.service.connect(h.sender, (event) => retried.push(event)).receive(h.request);
  await h.service.reserveErasureExclusion().waitForActiveMutations();
  expect(retried.at(-1)?.type).toBe('result');
});

it('refuses a changed configured destination before the provider POST', async () => {
  const h = await fixture();
  h.resolveModel
    .mockResolvedValueOnce({ ...config })
    .mockResolvedValueOnce({ ...config, baseUrl: 'https://changed.test/v1' });
  h.connection.receive(h.request);
  await h.service.reserveErasureExclusion().waitForActiveMutations();
  expect(h.events.at(-1)).toMatchObject({ type: 'failure', code: 'model-unavailable' });
  expect(h.events.some((event) => event.type === 'result')).toBe(false);
});

it.each(['', 'x'.repeat(CONTENT_TEXT_MAX_CHARS + 1)])(
  'preserves the source contract after an invalid provider response',
  async (text) => {
    const h = await fixture();
    h.requestProvider.mockResolvedValueOnce(text);
    h.connection.receive(h.request);
    await h.service.reserveErasureExclusion().waitForActiveMutations();
    expect(h.events.at(-1)?.type).toBe('failure');
    expect(h.events.some((event) => event.type === 'result')).toBe(false);
    expect(h.history).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failure', resultCount: 0 })
    );
  }
);

it('includes pending authorization in the deadline without provider work', async () => {
  const h = await fixture();
  vi.useFakeTimers();
  const authorization = deferred<void>();
  h.authorize.mockReturnValueOnce(authorization.promise);
  h.connection.receive(h.request);
  await vi.advanceTimersByTimeAsync(CONTENT_TEXT_TIMEOUT_MS);
  expect(h.events.at(-1)).toMatchObject({ type: 'failure', code: 'timeout' });
  authorization.resolve();
  await h.connection.disconnect();
  expect(h.requestProvider).not.toHaveBeenCalled();
});

it('ignores another cancellation and admits only one content start on a connection', async () => {
  const h = await fixture();
  const pending = deferred<void>();
  h.authorize.mockReturnValueOnce(pending.promise);
  h.connection.receive(h.request);
  h.connection.receive({ type: 'keepalive', requestId: h.request.requestId });
  h.connection.receive({ type: 'cancel', requestId: 'another-request' });
  expect(h.authorize).toHaveBeenCalledWith(
    h.request,
    h.sender,
    expect.objectContaining({ aborted: false })
  );
  h.connection.receive(h.request);
  expect(h.events.at(-1)).toMatchObject({ type: 'failure', code: 'invalid-request' });
  pending.resolve();
  await h.service.reserveErasureExclusion().waitForActiveMutations();
  expect(h.requestProvider).toHaveBeenCalledOnce();
  expect(h.events.at(-1)?.type).toBe('result');
});

it('keeps content erasure reservations local to a service and releases each only once', async () => {
  const first = await fixture();
  const second = await fixture();
  const released = first.service.reserveErasureExclusion();
  released.release();
  released.release();
  const held = first.service.reserveErasureExclusion();
  first.connection.receive(first.request);
  second.connection.receive(second.request);
  await second.service.reserveErasureExclusion().waitForActiveMutations();
  expect(first.events.at(-1)).toMatchObject({ type: 'failure', code: 'invalid-request' });
  expect(second.events.at(-1)?.type).toBe('result');
  held.release();
  first.connection.receive(first.request);
  await first.service.reserveErasureExclusion().waitForActiveMutations();
  expect(first.events.at(-1)?.type).toBe('result');
});
