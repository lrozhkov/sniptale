import { beforeEach, expect, it, vi } from 'vitest';
import { CURRENT_SCHEMA_CONTRACTS } from './schema-contracts';
import { DB_VERSION, EXPECTED_INDEXES, EXPECTED_STORES } from './core.stores';

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  openDB: vi.fn(),
  resetAlpha: vi.fn(async () => undefined),
  resetRecovery: vi.fn(async () => undefined),
}));

vi.mock('idb', () => ({ openDB: mocks.openDB }));
vi.mock('./admission', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./admission')>()),
  inspectDatabaseAdmission: mocks.inspect,
  runAlphaPersistenceReset: mocks.resetAlpha,
  runRecoveryPersistenceReset: mocks.resetRecovery,
}));

function createDatabase() {
  const objectStoreNames = [...EXPECTED_STORES] as string[] & {
    contains(name: string): boolean;
  };
  objectStoreNames.contains = (name) => objectStoreNames.includes(name);
  return {
    close: vi.fn(),
    getAll: vi.fn(async () => CURRENT_SCHEMA_CONTRACTS),
    objectStoreNames,
    transaction: vi.fn((storeName: string) => ({
      objectStore: vi.fn(() => ({
        indexNames: EXPECTED_INDEXES[storeName as keyof typeof EXPECTED_INDEXES] ?? [],
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubGlobal('navigator', {});
});

it('lets Gallery resume the alpha reset and returns typed admission failures', async () => {
  const database = createDatabase();
  mocks.openDB.mockResolvedValue(database);
  mocks.inspect
    .mockResolvedValueOnce({
      databaseVersion: null,
      reason: 'alpha-reset-required',
      status: 'blocked',
    })
    .mockResolvedValueOnce({ databaseVersion: DB_VERSION, status: 'ready' })
    .mockResolvedValueOnce({ databaseVersion: DB_VERSION, status: 'ready' });
  const module = await import('./core');

  await expect(module.prepareDatabaseForRecovery()).resolves.toEqual({
    databaseVersion: DB_VERSION,
    status: 'ready',
  });
  expect(mocks.resetAlpha).toHaveBeenCalledOnce();

  vi.resetModules();
  mocks.inspect.mockReset().mockResolvedValue({
    databaseVersion: null,
    reason: 'connection-blocked',
    status: 'blocked',
  });
  const blocked = await import('./core');
  await expect(blocked.prepareDatabaseForRecovery()).resolves.toMatchObject({
    reason: 'connection-blocked',
    status: 'blocked',
  });
});

it('resets all local persistence before preparing a fresh database', async () => {
  const database = createDatabase();
  mocks.openDB.mockResolvedValue(database);
  mocks.inspect.mockResolvedValue({ databaseVersion: DB_VERSION, status: 'ready' });
  const module = await import('./core');

  await expect(module.resetDatabaseFromRecovery()).resolves.toEqual({
    databaseVersion: DB_VERSION,
    status: 'ready',
  });
  expect(mocks.resetRecovery).toHaveBeenCalledOnce();
  expect(mocks.openDB).toHaveBeenCalledOnce();
});

it('resumes a journaled recovery reset before creating the fresh database', async () => {
  const database = createDatabase();
  mocks.openDB.mockResolvedValue(database);
  mocks.inspect
    .mockResolvedValueOnce({
      databaseVersion: null,
      reason: 'recovery-reset-required',
      status: 'blocked',
    })
    .mockResolvedValueOnce({ databaseVersion: DB_VERSION, status: 'ready' })
    .mockResolvedValueOnce({ databaseVersion: DB_VERSION, status: 'ready' });
  const module = await import('./core');

  await expect(module.prepareDatabaseForRecovery()).resolves.toEqual({
    databaseVersion: DB_VERSION,
    status: 'ready',
  });
  expect(mocks.resetRecovery).toHaveBeenCalledOnce();
  expect(mocks.openDB).toHaveBeenCalledOnce();
});

it('returns a typed retryable status when journaled recovery fails again', async () => {
  mocks.inspect.mockResolvedValue({
    databaseVersion: null,
    reason: 'recovery-reset-required',
    status: 'blocked',
  });
  mocks.resetRecovery.mockRejectedValue(new Error('OPFS unavailable'));
  const module = await import('./core');

  await expect(module.prepareDatabaseForRecovery()).resolves.toEqual({
    databaseVersion: null,
    reason: 'recovery-reset-failed',
    status: 'blocked',
  });
  expect(mocks.openDB).not.toHaveBeenCalled();
});

it('distinguishes a post-journal alpha interruption from a pre-effect connection block', async () => {
  const { PersistenceResetInterruptedError } = await import('./admission');
  mocks.inspect.mockResolvedValue({
    databaseVersion: null,
    reason: 'alpha-reset-required',
    status: 'blocked',
  });
  mocks.resetAlpha.mockRejectedValue(
    new PersistenceResetInterruptedError(new Error('preview cleanup failed'))
  );
  const module = await import('./core');

  await expect(module.prepareDatabaseForRecovery()).resolves.toEqual({
    databaseVersion: null,
    reason: 'recovery-reset-failed',
    status: 'blocked',
  });
  expect(mocks.openDB).not.toHaveBeenCalled();
});

it('keeps admission available when the browser persistence grant throws synchronously', async () => {
  vi.stubGlobal('navigator', {
    storage: {
      persist: () => {
        throw new Error('grant unavailable');
      },
    },
  });
  mocks.openDB.mockResolvedValue(createDatabase());
  mocks.inspect.mockReset().mockResolvedValue({ databaseVersion: DB_VERSION, status: 'ready' });
  const module = await import('./core');
  await expect(module.prepareDatabaseForRecovery()).resolves.toEqual({
    databaseVersion: DB_VERSION,
    status: 'ready',
  });
});

it.each(['alpha-reset-required', 'recovery-reset-required'] as const)(
  'verifies schema again after %s instead of admitting a failed reset',
  async (reason) => {
    mocks.resetAlpha.mockResolvedValue(undefined);
    mocks.resetRecovery.mockResolvedValue(undefined);
    mocks.inspect
      .mockReset()
      .mockResolvedValueOnce({ databaseVersion: null, reason, status: 'blocked' })
      .mockResolvedValueOnce({
        databaseVersion: DB_VERSION,
        reason: 'domain-contracts',
        status: 'corrupt',
      });
    const module = await import('./core');
    await expect(module.prepareDatabaseForRecovery()).resolves.toMatchObject({
      reason: 'domain-contracts',
      status: 'corrupt',
    });
    expect(mocks.openDB).not.toHaveBeenCalled();
  }
);

it('preserves an ordinary alpha-reset failure without replacing its cause', async () => {
  const error = new Error('reset not started');
  mocks.inspect.mockReset().mockResolvedValue({
    databaseVersion: null,
    reason: 'alpha-reset-required',
    status: 'blocked',
  });
  mocks.resetAlpha.mockRejectedValueOnce(error);
  const module = await import('./core');
  await expect(module.prepareDatabaseForRecovery()).rejects.toBe(error);
});

it('refuses a database whose schema changes during opening', async () => {
  mocks.openDB.mockResolvedValue(createDatabase());
  mocks.inspect
    .mockReset()
    .mockResolvedValueOnce({ databaseVersion: DB_VERSION, status: 'ready' })
    .mockResolvedValueOnce({
      databaseVersion: DB_VERSION,
      reason: 'domain-contracts',
      status: 'corrupt',
    });
  const module = await import('./core');
  await expect(module.prepareDatabaseForRecovery()).resolves.toMatchObject({
    reason: 'domain-contracts',
    status: 'corrupt',
  });
});
