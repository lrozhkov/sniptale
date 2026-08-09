import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPresence: vi.fn(),
  promoteStoredItem: vi.fn(),
}));

vi.mock('./presence-registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./presence-registry')>()),
  listAggregateEditorPresence: mocks.listPresence,
}));
vi.mock('../../../composition/persistence/library-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/library-lifecycle')>()),
  promoteStoredItem: mocks.promoteStoredItem,
}));

import { coordinateAggregatePromotion } from './coordinator';

function createPort(onPost: (message: unknown, emit: (message: unknown) => void) => void) {
  const messageListeners = new Set<(message: unknown) => void>();
  const disconnectListeners = new Set<() => void>();
  return {
    disconnect: vi.fn(),
    onDisconnect: {
      addListener: (listener: () => void) => disconnectListeners.add(listener),
      removeListener: (listener: () => void) => disconnectListeners.delete(listener),
    },
    onMessage: {
      addListener: (listener: (message: unknown) => void) => messageListeners.add(listener),
      removeListener: (listener: (message: unknown) => void) => messageListeners.delete(listener),
    },
    postMessage: vi.fn((message: unknown) =>
      onPost(message, (response) => {
        for (const listener of messageListeners) listener(response);
      })
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPresence.mockReturnValue([]);
  mocks.promoteStoredItem.mockResolvedValue(undefined);
});

it.each([
  [
    { id: 'image-1', kind: 'image' as const },
    { id: 'image-1', kind: 'media' as const },
  ],
  [
    { id: 'video-1', kind: 'video-project' as const },
    { id: 'video-1', kind: 'video-project' as const },
  ],
  [
    { id: 'scenario-1', kind: 'scenario' as const },
    { id: 'scenario-1', kind: 'scenario-project' as const },
  ],
])('promotes %j from durable state when no editor is open', async (aggregate, target) => {
  await coordinateAggregatePromotion(aggregate);
  expect(mocks.promoteStoredItem).toHaveBeenCalledWith(target);
});

it('asks the sole exact editor to flush and promote', async () => {
  const aggregate = { id: 'image-1', kind: 'image' as const };
  const port = createPort((message, emit) => {
    const request = message as { requestId: string };
    queueMicrotask(() =>
      emit({ requestId: request.requestId, success: true, type: 'promotion-result' })
    );
  });
  mocks.listPresence.mockReturnValue([
    { aggregate, documentId: 'document-1', port, senderUrl: 'editor-url' },
  ]);

  await coordinateAggregatePromotion(aggregate);

  expect(port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ aggregate, requestId: expect.any(String), type: 'promote' })
  );
  expect(mocks.promoteStoredItem).not.toHaveBeenCalled();
});

it('rejects multiple editors before any mutation', async () => {
  const aggregate = { id: 'image-1', kind: 'image' as const };
  mocks.listPresence.mockReturnValue([
    { aggregate, documentId: 'document-1' },
    { aggregate, documentId: 'document-2' },
  ]);

  await expect(coordinateAggregatePromotion(aggregate)).rejects.toThrow('multiple editor tabs');
  expect(mocks.promoteStoredItem).not.toHaveBeenCalled();
});

it('surfaces editor CAS failure without falling back to a partial promotion', async () => {
  const aggregate = { id: 'scenario-1', kind: 'scenario' as const };
  const port = createPort((message, emit) => {
    const request = message as { requestId: string };
    queueMicrotask(() =>
      emit({
        error: 'workspace changed during render',
        requestId: request.requestId,
        success: false,
        type: 'promotion-result',
      })
    );
  });
  mocks.listPresence.mockReturnValue([
    { aggregate, documentId: 'document-1', port, senderUrl: 'scenario-url' },
  ]);

  await expect(coordinateAggregatePromotion(aggregate)).rejects.toThrow(
    'workspace changed during render'
  );
  expect(mocks.promoteStoredItem).not.toHaveBeenCalled();
});
