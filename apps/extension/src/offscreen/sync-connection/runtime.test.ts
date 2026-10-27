import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createSyncConnectionExecutor,
  type SyncExecutionResult,
  type SyncWorkspaceExecutionResult,
} from './executor';
import { registerOffscreenSyncMessageListener } from './runtime';

type Listener = Parameters<typeof browserRuntime.subscribeToMessages>[0];
const { subscribe, unsubscribe, sendMessage } = vi.hoisted(() => ({
  subscribe: vi.fn<(listener: Listener) => () => void>(),
  unsubscribe: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: { subscribeToMessages: subscribe, sendMessage },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const executorId = '11111111-1111-4111-8111-111111111111';
const offscreenStartupId = '22222222-2222-4222-8222-222222222222';
const sender: chrome.runtime.MessageSender = {
  id: 'extension',
  url: 'chrome-extension://extension/service-worker-loader.js',
  origin: 'chrome-extension://extension',
};
const refusal = { success: false, error: 'Sync executor command refused' };
function command(
  type: typeof MessageType.OFFSCREEN_SYNC_START | typeof MessageType.OFFSCREEN_SYNC_STOP
) {
  const common = {
    type,
    executorId,
    offscreenStartupId,
    executorRevision: 1,
    requestId: crypto.randomUUID(),
  };
  return type === MessageType.OFFSCREEN_SYNC_START
    ? {
        ...common,
        scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
        authorization: { incarnation: '44444444-4444-4444-8444-444444444444', revision: 1 },
        operationId: 'operation',
        expectedRevision: 1,
      }
    : common;
}
function fixture() {
  const workflow = deferred<SyncExecutionResult>();
  const createExecution = vi.fn(() => ({
    run: () => workflow.promise,
    drain: async () => undefined,
  }));
  const workspaceWorkflow = deferred<SyncWorkspaceExecutionResult>();
  const workspaceDrain = vi.fn(async () => undefined);
  const createWorkspaceExecution = vi.fn(() => ({
    run: () => workspaceWorkflow.promise,
    drain: workspaceDrain,
  }));
  const executor = createSyncConnectionExecutor({
    executorId,
    offscreenStartupId,
    createExecution,
    createWorkspaceExecution,
  });
  const release = registerOffscreenSyncMessageListener(executor);
  const listener = subscribe.mock.calls[0]?.[0];
  if (!listener) throw new Error('Sync listener was not installed.');
  return {
    executor,
    workflow,
    workspaceWorkflow,
    createWorkspaceExecution,
    workspaceDrain,
    createExecution,
    release,
    listener,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  subscribe.mockReturnValue(unsubscribe);
});

describe('offscreen sync receiver', () => {
  it('accepts a real authorized envelope with a short ACK while the workflow remains pending', async () => {
    const test = fixture();
    const reply = vi.fn();
    const message = attachRuntimeMessageFreshness(
      attachOffscreenCommandCapability(command(MessageType.OFFSCREEN_SYNC_START))
    );
    expect(test.listener(message, sender, reply)).toBe(false);
    expect(reply).toHaveBeenCalledExactlyOnceWith({
      success: true,
      result: 'accepted',
      executorId,
      executorRevision: 2,
    });
    expect(test.createExecution).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(test.createExecution).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledOnce();
    expect(sendMessage).not.toHaveBeenCalled();
    test.workflow.resolve({
      containment: 'contained',
      snapshot: { state: 'failed', stage: 'queued', failureCode: 'authentication', runId: null },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(sendMessage).not.toHaveBeenCalled();
    test.release();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not claim unrelated messages or send replies for them', () => {
    const test = fixture();
    const reply = vi.fn();
    for (const message of [
      null,
      'message',
      {},
      { type: 'OFFSCREEN_ERROR' },
      { type: MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION },
    ]) {
      expect(test.listener(message, sender, reply)).toBeUndefined();
    }
    expect(reply).not.toHaveBeenCalled();
    expect(test.createExecution).not.toHaveBeenCalled();
  });

  it('refuses neighboring page and content senders before dispatch', () => {
    const test = fixture();
    for (const rejectedSender of [
      { ...sender, url: 'chrome-extension://extension/settings.html' },
      { ...sender, url: 'https://content.example/article' },
      { ...sender, origin: 'https://foreign.example' },
    ]) {
      const reply = vi.fn();
      const envelope = attachRuntimeMessageFreshness(
        attachOffscreenCommandCapability(command(MessageType.OFFSCREEN_SYNC_START))
      );
      expect(test.listener(envelope, rejectedSender, reply)).toBe(false);
      expect(reply).toHaveBeenCalledExactlyOnceWith(refusal);
    }
    expect(test.createExecution).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('rejects malformed commands after real authorization and rejects missing capability', () => {
    const test = fixture();
    const malformed = attachOffscreenCommandCapability({
      ...command(MessageType.OFFSCREEN_SYNC_START),
      expectedRevision: -1,
    });
    const reply = vi.fn();
    expect(test.listener(attachRuntimeMessageFreshness(malformed), sender, reply)).toBe(false);
    expect(reply).toHaveBeenCalledExactlyOnceWith(refusal);
    const unsignedReply = vi.fn();
    expect(
      test.listener(
        attachRuntimeMessageFreshness(command(MessageType.OFFSCREEN_SYNC_START)),
        sender,
        unsignedReply
      )
    ).toBe(false);
    expect(unsignedReply).toHaveBeenCalledExactlyOnceWith(refusal);
    expect(test.createExecution).not.toHaveBeenCalled();
  });

  it('replies to a duplicate signed Start without dispatching another workflow', async () => {
    const test = fixture();
    const signed = attachOffscreenCommandCapability(command(MessageType.OFFSCREEN_SYNC_START));
    const first = vi.fn();
    const delivered = deferred<unknown>();
    const duplicate = vi.fn((response: unknown) => delivered.resolve(response));
    expect(test.listener(attachRuntimeMessageFreshness(signed), sender, first)).toBe(false);
    expect(test.listener(attachRuntimeMessageFreshness(signed), sender, duplicate)).toBe(true);
    await delivered.promise;
    expect(duplicate).toHaveBeenCalledExactlyOnceWith(first.mock.calls[0]?.[0]);
    expect(test.createExecution).toHaveBeenCalledOnce();
    test.workflow.resolve({
      containment: 'contained',
      snapshot: { state: 'published', stage: 'published', runId: null, failureCode: null },
    });
    await Promise.resolve();
  });

  it('isolates rejected asynchronous Stop responses and permits another explicit attempt', async () => {
    const test = fixture();
    const pending = deferred<Awaited<ReturnType<typeof test.executor.stop>>>();
    const stop = vi.spyOn(test.executor, 'stop').mockReturnValueOnce(pending.promise);
    const signed = attachOffscreenCommandCapability(command(MessageType.OFFSCREEN_SYNC_STOP));
    const reply = vi.fn();
    expect(test.listener(attachRuntimeMessageFreshness(signed), sender, reply)).toBe(true);
    expect(reply).not.toHaveBeenCalled();
    pending.reject(new Error('Private adapter detail.'));
    await Promise.resolve();
    expect(reply).toHaveBeenCalledExactlyOnceWith(refusal);
    expect(sendMessage).not.toHaveBeenCalled();
    stop.mockResolvedValueOnce({
      success: true,
      result: 'stopped',
      executorId,
      executorRevision: 2,
    });
    const retry = vi.fn();
    expect(test.listener(attachRuntimeMessageFreshness(signed), sender, retry)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(2);
    expect(retry).toHaveBeenCalledExactlyOnceWith({
      success: true,
      result: 'stopped',
      executorId,
      executorRevision: 2,
    });
  });

  it('contains synchronous execution errors in the sync response', () => {
    const test = fixture();
    vi.spyOn(test.executor, 'start').mockImplementationOnce(() => {
      throw new Error('Private failure.');
    });
    const reply = vi.fn();
    const signed = attachOffscreenCommandCapability(command(MessageType.OFFSCREEN_SYNC_START));
    expect(test.listener(attachRuntimeMessageFreshness(signed), sender, reply)).toBe(false);
    expect(reply).toHaveBeenCalledExactlyOnceWith(refusal);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

it.each(['allocation', 'join'] as const)(
  'authorizes %s admission and replays its signed ACK without duplicate execution or secrets',
  async (kind) => {
    const test = fixture();
    const unsigned = {
      type: MessageType.OFFSCREEN_SYNC_WORKSPACE_START,
      executorId,
      offscreenStartupId,
      executorRevision: 1,
      requestId: crypto.randomUUID(),
      source: {
        kind,
        identity: { incarnation: '44444444-4444-4444-8444-444444444444', revision: 1 },
      },
      authentication: { kind: 'bearer', accessToken: 'private-workspace-secret' },
    };
    const signed = attachOffscreenCommandCapability(unsigned);
    const first = vi.fn();
    const duplicate = vi.fn();
    expect(test.listener(attachRuntimeMessageFreshness(signed), sender, first)).toBe(false);
    expect(test.createWorkspaceExecution).toHaveBeenCalledOnce();
    expect(test.listener(attachRuntimeMessageFreshness(signed), sender, duplicate)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(duplicate).toHaveBeenCalledExactlyOnceWith(first.mock.calls[0]?.[0]);
    expect(JSON.stringify(first.mock.calls)).not.toContain('private-workspace-secret');
    expect(sendMessage).not.toHaveBeenCalled();
    test.workspaceWorkflow.resolve({
      snapshot: { state: 'failed', failureCode: 'temporary' },
      containment: 'contained',
    });
    await Promise.resolve();
    await Promise.resolve();
    const completedReplay = vi.fn();
    expect(test.listener(attachRuntimeMessageFreshness(signed), sender, completedReplay)).toBe(
      true
    );
    await Promise.resolve();
    expect(test.createWorkspaceExecution).toHaveBeenCalledOnce();
    const current = test.executor.inspect({
      type: MessageType.OFFSCREEN_SYNC_INSPECT,
      capabilityToken: 'test',
      requestId: crypto.randomUUID(),
      offscreenStartupId,
      challenge: crypto.randomUUID(),
    });
    if (!current.success) throw new Error('Inspect refused');
    const retry = attachOffscreenCommandCapability({
      ...unsigned,
      requestId: crypto.randomUUID(),
      executorRevision: current.snapshot.executorRevision,
    });
    const retryReply = vi.fn();
    expect(test.listener(attachRuntimeMessageFreshness(retry), sender, retryReply)).toBe(false);
    expect(test.createWorkspaceExecution).toHaveBeenCalledTimes(2);
  }
);

it('refuses workspace commands with missing capability, stale freshness, foreign senders or unknown fields', () => {
  const test = fixture();
  const command = {
    type: MessageType.OFFSCREEN_SYNC_WORKSPACE_START,
    executorId,
    offscreenStartupId,
    executorRevision: 1,
    requestId: crypto.randomUUID(),
    source: {
      kind: 'allocation',
      identity: { incarnation: '44444444-4444-4444-8444-444444444444', revision: 1 },
    },
    authentication: { kind: 'bearer', accessToken: 'private-workspace-secret' },
  };
  for (const [message, originSender] of [
    [attachRuntimeMessageFreshness(command), sender],
    [attachOffscreenCommandCapability(command), sender],
    [
      attachRuntimeMessageFreshness(attachOffscreenCommandCapability(command)),
      { ...sender, url: 'chrome-extension://extension/settings.html' },
    ],
    [
      attachRuntimeMessageFreshness(
        attachOffscreenCommandCapability({ ...command, unknown: true })
      ),
      sender,
    ],
  ] as const) {
    const reply = vi.fn();
    expect(test.listener(message, originSender, reply)).toBe(false);
    expect(reply).toHaveBeenCalledOnce();
    expect(reply.mock.calls[0]?.[0]).toMatchObject({ success: false });
  }
  expect(test.createWorkspaceExecution).not.toHaveBeenCalled();
});
