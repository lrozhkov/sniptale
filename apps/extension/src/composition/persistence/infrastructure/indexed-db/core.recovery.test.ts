import { beforeEach, expect, it, vi } from 'vitest';
import { CURRENT_SCHEMA_CONTRACTS } from './schema-contracts';
import { EXPECTED_INDEXES, EXPECTED_STORES } from './core.stores';

const mocks = vi.hoisted(() => ({
  cutover: vi.fn(async () => undefined),
  inspect: vi.fn(),
  openDB: vi.fn(),
  resetAlpha: vi.fn(async () => undefined),
  resetRecovery: vi.fn(async () => undefined),
}));

vi.mock('idb', () => ({ openDB: mocks.openDB }));
vi.mock('./maintenance/web-snapshot-page-package-cutover', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./maintenance/web-snapshot-page-package-cutover')>()),
  runWebSnapshotPagePackageCutover: mocks.cutover,
}));
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
    .mockResolvedValueOnce({ databaseVersion: 1, status: 'ready' })
    .mockResolvedValueOnce({ databaseVersion: 1, status: 'ready' });
  const module = await import('./core');

  await expect(module.prepareDatabaseForRecovery()).resolves.toEqual({
    databaseVersion: 1,
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
  mocks.inspect.mockResolvedValue({ databaseVersion: 1, status: 'ready' });
  const module = await import('./core');

  await expect(module.resetDatabaseFromRecovery()).resolves.toEqual({
    databaseVersion: 1,
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
    .mockResolvedValueOnce({ databaseVersion: 1, status: 'ready' })
    .mockResolvedValueOnce({ databaseVersion: 1, status: 'ready' });
  const module = await import('./core');

  await expect(module.prepareDatabaseForRecovery()).resolves.toEqual({
    databaseVersion: 1,
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
