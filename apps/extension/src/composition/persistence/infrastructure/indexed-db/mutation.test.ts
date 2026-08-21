import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { initDBMock } = vi.hoisted(() => ({ initDBMock: vi.fn() }));

vi.mock('./core', () => ({ initDB: initDBMock }));

import {
  installPersistenceLockManagerForTests,
  runWithPersistentDataErasureBarrier,
} from '../mutation-barrier';
import { runWithIndexedDbMutation } from './mutation';

let lockQueues = new Map<string, Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  initDBMock.mockResolvedValue({ id: 'db' });
  lockQueues = new Map();
  installPersistenceLockManagerForTests({
    request(name, _options, operation) {
      const execution = (lockQueues.get(name) ?? Promise.resolve()).then(operation);
      lockQueues.set(
        name,
        execution.then(
          () => undefined,
          () => undefined
        )
      );
      return execution;
    },
  });
});

it('finishes database readiness before admitting the mutation lock', async () => {
  let resolveDatabase!: (database: { id: string }) => void;
  initDBMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveDatabase = resolve;
    })
  );
  const write = vi.fn(async () => undefined);
  const erase = vi.fn(async () => undefined);

  const mutation = runWithIndexedDbMutation(write);
  await vi.waitFor(() => expect(initDBMock).toHaveBeenCalledWith());
  const erasure = runWithPersistentDataErasureBarrier(erase);
  await erasure;
  expect(erase).toHaveBeenCalledOnce();
  expect(write).not.toHaveBeenCalled();
  resolveDatabase({ id: 'db' });

  await mutation;
  expect(write).toHaveBeenCalledWith({ id: 'db' });
});

afterEach(() => {
  installPersistenceLockManagerForTests(null);
});

it('holds mutation admission through completion and queues a late writer behind erasure', async () => {
  let releaseTransaction!: () => void;
  const transactionDone = new Promise<void>((resolve) => {
    releaseTransaction = resolve;
  });
  const admittedWrite = vi.fn(async () => transactionDone);
  const erasureOperation = vi.fn(async () => undefined);
  const lateWrite = vi.fn(async () => undefined);

  const mutation = runWithIndexedDbMutation(admittedWrite);
  await vi.waitFor(() => expect(admittedWrite).toHaveBeenCalledWith({ id: 'db' }));
  const erasure = runWithPersistentDataErasureBarrier(erasureOperation);
  const lateMutation = runWithIndexedDbMutation(lateWrite);
  await Promise.resolve();

  expect(erasureOperation).not.toHaveBeenCalled();
  expect(lateWrite).not.toHaveBeenCalled();

  releaseTransaction();
  await mutation;
  await erasure;
  await lateMutation;
  expect(erasureOperation).toHaveBeenCalledOnce();
  expect(lateWrite).toHaveBeenCalledWith({ id: 'db' });
});
