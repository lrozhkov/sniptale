import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentSenderBinding } from '../routing-contracts/capabilities/content-action/capability-store';
import {
  installPersistenceLockManagerForTests,
  runWithPersistentDataErasureBarrier,
  type PersistenceLockManager,
} from '../../composition/persistence/infrastructure/mutation-barrier';
import { DEFAULT_BORDER_PRESET } from '../../features/highlighter/style/defaults';
import { serializeAnnotationForkDraftPayload } from '../../features/highlighter/frame-annotation/annotation-fork-payload';

const EMPTY_DRAFT_PAYLOAD = JSON.stringify({ drafts: {}, version: 1 });

const storage = vi.hoisted(() => ({
  record: { payload: null as string | null, revision: 0 },
  clear: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));

vi.mock(
  '../../composition/persistence/content-pin-session/annotation-fork',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../composition/persistence/content-pin-session/annotation-fork')
    >()),
    clearAnnotationForkSessionPayload: storage.clear,
    readAnnotationForkSessionRecord: storage.read,
    writeAnnotationForkSessionRecord: storage.write,
  })
);

import {
  bindAnnotationForkSessionDocument,
  clearAnnotationForkSessionForTab,
  routeAnnotationForkSessionMessage,
} from './route';

interface PendingLock {
  mode: 'exclusive' | 'shared';
  operation: () => unknown | Promise<unknown>;
  reject(error: unknown): void;
  resolve(value: unknown): void;
}

function createLockManager(): PersistenceLockManager {
  const locks = new Map<
    string,
    { activeExclusive: boolean; activeShared: number; pending: PendingLock[] }
  >();
  const getState = (name: string) => {
    const current = locks.get(name);
    if (current) return current;
    const created = { activeExclusive: false, activeShared: 0, pending: [] as PendingLock[] };
    locks.set(name, created);
    return created;
  };
  const drain = (name: string) => {
    const state = getState(name);
    if (state.activeExclusive || state.pending.length === 0) return;
    const first = state.pending[0]!;
    if (first.mode === 'exclusive') {
      if (state.activeShared > 0) return;
      state.pending.shift();
      state.activeExclusive = true;
      void Promise.resolve()
        .then(first.operation)
        .then(first.resolve, first.reject)
        .finally(() => {
          state.activeExclusive = false;
          drain(name);
        });
      return;
    }
    while (state.pending[0]?.mode === 'shared' && !state.activeExclusive) {
      const next = state.pending.shift()!;
      state.activeShared += 1;
      void Promise.resolve()
        .then(next.operation)
        .then(next.resolve, next.reject)
        .finally(() => {
          state.activeShared -= 1;
          drain(name);
        });
    }
  };
  return {
    request(name, options, operation) {
      return new Promise((resolve, reject) => {
        getState(name).pending.push({
          mode: options.mode,
          operation,
          reject,
          resolve: resolve as (value: unknown) => void,
        });
        drain(name);
      });
    },
  };
}

const senderBinding: ContentSenderBinding = {
  documentId: 'document-7',
  frameId: 0,
  senderUrl: 'https://example.test',
  tabId: 7,
};

beforeEach(async () => {
  installPersistenceLockManagerForTests(createLockManager());
  vi.clearAllMocks();
  storage.record = { payload: null, revision: 0 };
  storage.read.mockImplementation(async () => ({ ...storage.record }));
  storage.clear.mockImplementation(async () => {
    storage.record = { payload: null, revision: 0 };
  });
  storage.write.mockImplementation(async (_tabId, record) => {
    storage.record = { ...record };
  });
  await bindAnnotationForkSessionDocument(senderBinding.tabId, senderBinding.documentId);
});

afterEach(() => {
  installPersistenceLockManagerForTests(null);
});

async function route(message: unknown, binding: ContentSenderBinding | null = senderBinding) {
  return new Promise<unknown>((resolve) => {
    expect(
      routeAnnotationForkSessionMessage({ message, senderBinding: binding, sendResponse: resolve })
    ).toBe(true);
  });
}

it('serializes writes and rejects a stale document revision without overwriting the latest draft', async () => {
  await expect(
    route({
      expectedRevision: 0,
      operation: 'write',
      payload: EMPTY_DRAFT_PAYLOAD,
      type: MessageType.ANNOTATION_FORK_SESSION,
    })
  ).resolves.toMatchObject({ result: 'written', revision: 1, success: true });

  await expect(
    route({
      expectedRevision: 0,
      operation: 'write',
      payload: EMPTY_DRAFT_PAYLOAD,
      type: MessageType.ANNOTATION_FORK_SESSION,
    })
  ).resolves.toMatchObject({ result: 'stale', revision: 1, success: true });
  expect(storage.record).toEqual({ payload: EMPTY_DRAFT_PAYLOAD, revision: 1 });
  expect(storage.write).toHaveBeenCalledTimes(1);
});

it('binds writes to the current top-frame document across a navigation race', async () => {
  const currentDocument = { ...senderBinding, documentId: 'document-current' };
  await bindAnnotationForkSessionDocument(senderBinding.tabId, currentDocument.documentId);

  await expect(
    route(
      {
        expectedRevision: 0,
        operation: 'write',
        payload: EMPTY_DRAFT_PAYLOAD,
        type: MessageType.ANNOTATION_FORK_SESSION,
      },
      senderBinding
    )
  ).resolves.toMatchObject({ result: 'stale-document', revision: 0, success: true });
  expect(storage.write).not.toHaveBeenCalled();

  await expect(
    route(
      {
        expectedRevision: 0,
        operation: 'write',
        payload: EMPTY_DRAFT_PAYLOAD,
        type: MessageType.ANNOTATION_FORK_SESSION,
      },
      currentDocument
    )
  ).resolves.toMatchObject({ result: 'written', revision: 1, success: true });
  expect(storage.write).toHaveBeenCalledOnce();
});

it('fails closed without an authorized top-frame sender binding', async () => {
  await expect(
    route({ operation: 'read', type: MessageType.ANNOTATION_FORK_SESSION }, null)
  ).resolves.toEqual({
    error: 'Unauthorized annotation fork session sender',
    success: false,
  });
});

it('reads the current revision and clears it through the same serialized owner', async () => {
  storage.record = { payload: EMPTY_DRAFT_PAYLOAD, revision: 4 };
  await expect(
    route({ operation: 'read', type: MessageType.ANNOTATION_FORK_SESSION })
  ).resolves.toMatchObject({
    payload: EMPTY_DRAFT_PAYLOAD,
    result: 'read',
    revision: 4,
    success: true,
  });
  await expect(
    route({
      expectedRevision: 4,
      operation: 'clear',
      type: MessageType.ANNOTATION_FORK_SESSION,
    })
  ).resolves.toMatchObject({ result: 'cleared', revision: 5, success: true });
  expect(storage.record).toEqual({ payload: null, revision: 5 });
});

it('declines malformed and neighboring route messages before touching storage', () => {
  expect(
    routeAnnotationForkSessionMessage({
      message: {
        operation: 'read',
        payload: 'unexpected',
        type: MessageType.ANNOTATION_FORK_SESSION,
      },
      senderBinding,
      sendResponse: vi.fn(),
    })
  ).toBe(false);
  expect(storage.read).not.toHaveBeenCalled();
});

it('rejects arbitrary and text-bearing draft JSON at the background owner boundary', () => {
  const frameWithPrivateLabel = JSON.parse(
    serializeAnnotationForkDraftPayload({
      frame: {
        blurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
        borderSettings: DEFAULT_BORDER_PRESET,
        effectMode: 'border',
        focusSettings: { opacity: 0.5, showBorder: true },
      },
    })
  ) as { drafts: { frame: { borderSettings: Record<string, unknown> } } };
  frameWithPrivateLabel.drafts.frame.borderSettings['sourcePresetName'] = 'private template label';
  for (const payload of [
    JSON.stringify({ arbitrary: 'page text' }),
    JSON.stringify({ drafts: { callout: { content: { bodyHtml: 'private' } } }, version: 1 }),
    JSON.stringify({ drafts: {}, secret: 'private', version: 1 }),
    '{"drafts":{"constructor":"private page text"},"version":1}',
    '{"drafts":{"toString":"private page text"},"version":1}',
    '{"drafts":{"__proto__":"private page text"},"version":1}',
    JSON.stringify(frameWithPrivateLabel),
  ]) {
    expect(
      routeAnnotationForkSessionMessage({
        message: {
          expectedRevision: 0,
          operation: 'write',
          payload,
          type: MessageType.ANNOTATION_FORK_SESSION,
        },
        senderBinding,
        sendResponse: vi.fn(),
      })
    ).toBe(false);
  }
  expect(storage.write).not.toHaveBeenCalled();
});

it('keeps a delayed write ahead of privacy erasure and tab-close cleanup', async () => {
  let releaseRead!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  storage.read.mockImplementationOnce(async () => {
    await readGate;
    return { payload: null, revision: 0 };
  });
  const write = route({
    expectedRevision: 0,
    operation: 'write',
    payload: EMPTY_DRAFT_PAYLOAD,
    type: MessageType.ANNOTATION_FORK_SESSION,
  });
  await vi.waitFor(() => expect(storage.read).toHaveBeenCalledOnce());

  const erasureOperation = vi.fn(async () => undefined);
  const erasure = runWithPersistentDataErasureBarrier(erasureOperation);
  const tabClose = clearAnnotationForkSessionForTab(7);
  await Promise.resolve();
  expect(erasureOperation).not.toHaveBeenCalled();
  expect(storage.clear).not.toHaveBeenCalled();

  releaseRead();
  await write;
  await erasure;
  await tabClose;
  expect(storage.write).toHaveBeenCalledOnce();
  expect(erasureOperation).toHaveBeenCalledOnce();
  expect(storage.clear).toHaveBeenCalledOnce();
  expect(storage.clear.mock.invocationCallOrder[0]).toBeGreaterThan(
    storage.write.mock.invocationCallOrder[0]!
  );
});
