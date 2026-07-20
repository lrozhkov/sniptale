import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { initDBMock } = vi.hoisted(() => ({ initDBMock: vi.fn() }));

vi.mock('./core', () => ({ initDB: initDBMock }));

import {
  isActivePersistenceMutationPermit,
  installPersistenceLockManagerForTests,
  runWithPersistentDataErasureBarrier,
} from '../mutation-barrier';
import { runWithIndexedDbMutation } from './mutation';

let lockQueue = Promise.resolve();

beforeEach(() => {
  vi.clearAllMocks();
  initDBMock.mockResolvedValue({ id: 'db' });
  lockQueue = Promise.resolve();
  installPersistenceLockManagerForTests({
    request(_name, _options, operation) {
      const execution = lockQueue.then(operation);
      lockQueue = execution.then(
        () => undefined,
        () => undefined
      );
      return execution;
    },
  });
});

it('does not reacquire a shared lock while database initialization is pending', async () => {
  let resolveDatabase!: (database: { id: string }) => void;
  initDBMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveDatabase = resolve;
    })
  );
  const write = vi.fn(async () => undefined);
  const erase = vi.fn(async () => undefined);

  const mutation = runWithIndexedDbMutation(write);
  await vi.waitFor(() => expect(initDBMock).toHaveBeenCalledWith(expect.any(Object)));
  const permit = initDBMock.mock.calls[0]?.[0];
  expect(isActivePersistenceMutationPermit(permit)).toBe(true);
  const erasure = runWithPersistentDataErasureBarrier(erase);
  resolveDatabase({ id: 'db' });

  await mutation;
  await erasure;
  expect(write).toHaveBeenCalledWith({ id: 'db' });
  expect(erase).toHaveBeenCalledOnce();
  expect(isActivePersistenceMutationPermit(permit)).toBe(false);
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
