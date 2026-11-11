import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImageJobService } from './service';
import { AIProviderRequestError } from '../providers';
import {
  IMAGE_JOB_TIMEOUT_MS,
  type ImageJobStart,
  type ImageJobServerMessage,
} from '../../../contracts/ai/image';
import type { ImageModelConfig } from './model-config';
import { resolveImageModelProfile } from '../../../contracts/ai/image-profile';

const uuid = 'fdd43bfc-2c5b-416e-91b2-d2c2cc820ac7';
const start: ImageJobStart = {
  type: 'start',
  requestId: uuid,
  modelId: 'model',
  approvedProviderId: 'provider',
  approvedModelCode: 'code',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  llmSessionToken: 'token',
  scope: { documentId: 'doc', sessionId: uuid, snapshotId: uuid },
  context: {
    version: 1,
    intention: 'new-image',
    prompt: 'Draw',
    images: [],
    parameters: { variants: 3 },
  },
};
const profile = resolveImageModelProfile(
  { modelCode: 'black-forest-labs/flux-3-image-klein', operation: 'image-generation' },
  { connectionType: 'openai-compatible', baseUrl: 'https://routerai.ru/api/v1' },
  'image-generation'
);
if (!profile) throw new Error('Expected profile');
const config: ImageModelConfig = {
  baseUrl: 'https://routerai.ru/api/v1',
  connectionType: 'openai-compatible',
  modelCode: 'code',
  apiKey: 'synthetic',
  profile,
};
const image = { dataUrl: 'synthetic-only-in-unit-test', width: 1, height: 1 };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  type Deps = Required<NonNullable<Parameters<typeof createImageJobService>[0]>>;
  const deps = {
    authorize: vi.fn<Deps['authorize']>(async () => {}),
    resolveModel: vi.fn<Deps['resolveModel']>(async () => config),
    request: vi.fn<Deps['request']>(async (options) => {
      await options.beforeSend();
      return { image };
    }),
  };
  const service = createImageJobService(deps);
  const messages: ImageJobServerMessage[] = [];
  const connection = service.connect({ documentId: 'doc' }, (message) => messages.push(message));
  async function settle() {
    const reservation = service.reserveErasureExclusion();
    await reservation.waitForActiveMutations();
    reservation.release();
  }
  return { service, connection, messages, deps, settle };
}
afterEach(() => vi.useRealTimers());

it('preserves the safe provider rejection reason without copying exception text', async () => {
  const { deps, messages, connection, settle } = setup();
  deps.request.mockRejectedValue(new AIProviderRequestError('quota-exceeded', 'PRIVATE BODY'));
  connection.receive(start);
  await settle();
  expect(messages.at(-1)).toEqual({
    type: 'failure',
    requestId: uuid,
    code: 'provider-failed',
    failureReason: 'quota-exceeded',
  });
  expect(JSON.stringify(messages)).not.toContain('PRIVATE BODY');
});

describe('image operation lifecycle', () => {
  it('approves once, requests variants sequentially and preserves each preview before completion', async () => {
    const { deps, messages, connection, settle } = setup();
    connection.receive(start);
    await settle();
    expect(deps.authorize).toHaveBeenCalledTimes(1);
    expect(deps.request).toHaveBeenCalledTimes(3);
    expect(deps.resolveModel).toHaveBeenCalledTimes(4);
    expect(
      messages.filter((message) => message.type === 'image').map((message) => message.variant)
    ).toEqual([0, 1, 2]);
    expect(messages.at(-1)).toEqual({ type: 'complete', requestId: uuid, received: 3 });
  });
  it('retains completed variants on failure and never retries the failed paid call', async () => {
    const { deps, messages, connection, settle } = setup();
    deps.request
      .mockResolvedValueOnce({ image })
      .mockRejectedValueOnce(new Error('provider-failed'));
    connection.receive(start);
    await settle();
    expect(deps.request).toHaveBeenCalledTimes(2);
    expect(messages.filter((message) => message.type === 'image')).toHaveLength(1);
    expect(messages.at(-1)).toEqual({ type: 'failure', requestId: uuid, code: 'provider-failed' });
  });
  it('blocks a stale provider before dispatch', async () => {
    const { deps, messages, connection, settle } = setup();
    deps.resolveModel
      .mockResolvedValueOnce(config)
      .mockResolvedValue({ ...config, baseUrl: 'https://changed.test' });
    const post = vi.fn();
    deps.request.mockImplementation(async (options) => {
      await options.beforeSend();
      post();
      return { image };
    });
    connection.receive(start);
    await settle();
    expect(post).not.toHaveBeenCalled();
    expect(messages.at(-1)).toMatchObject({ type: 'failure', code: 'stale' });
  });
  it('cancels during a pending request and suppresses its late preview and later variants', async () => {
    const { deps, messages, connection, settle } = setup();
    const entered = deferred();
    const release = deferred();
    deps.request.mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return { image };
    });
    connection.receive(start);
    await entered.promise;
    connection.receive({ type: 'cancel', requestId: uuid });
    release.resolve();
    await settle();
    expect(messages.at(-1)).toMatchObject({ type: 'failure', code: 'cancelled' });
    expect(messages.some((message) => message.type === 'image')).toBe(false);
    expect(deps.request).toHaveBeenCalledTimes(1);
  });
  it('drains erasure, refuses new admission and ignores all responses after disconnect', async () => {
    const { deps, messages, connection, service } = setup();
    const entered = deferred();
    const release = deferred();
    deps.request.mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return { image };
    });
    connection.receive(start);
    await entered.promise;
    const reservation = service.reserveErasureExclusion();
    const blockedMessages: ImageJobServerMessage[] = [];
    const other = service.connect({}, (message) => blockedMessages.push(message));
    other.receive(start);
    expect(blockedMessages.at(-1)).toMatchObject({ code: 'invalid-request' });
    const disconnect = connection.disconnect();
    const count = messages.length;
    const drain = service.cancelActiveJob();
    release.resolve();
    await Promise.all([disconnect, drain, reservation.waitForActiveMutations()]);
    reservation.release();
    expect(messages).toHaveLength(count);
    expect(deps.request).toHaveBeenCalledTimes(1);
  });
  it('times out and rejects replay on the same connection', async () => {
    vi.useFakeTimers();
    const { deps, messages, connection, settle } = setup();
    const entered = deferred();
    const release = deferred();
    deps.request.mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return { image };
    });
    connection.receive(start);
    await entered.promise;
    await vi.advanceTimersByTimeAsync(IMAGE_JOB_TIMEOUT_MS);
    release.resolve();
    await settle();
    expect(messages.at(-1)).toMatchObject({ code: 'timeout' });
    connection.receive(start);
    expect(messages.at(-1)).toMatchObject({ code: 'invalid-request' });
    expect(deps.authorize).toHaveBeenCalledTimes(1);
  });
});
