vi.mock('../../sync-transfer/editing-admission', () => ({
  ensureNativeBackupRootAvailable: io.prepare,
}));
import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  prepare: vi.fn(),
  active: false,
  inventory: vi.fn(),
  write: vi.fn(),
  abort: vi.fn(),
  backfill: vi.fn(),
  pick: vi.fn(),
}));
vi.mock('../../../composition/persistence/scenario/library-publication', () => ({
  backfillScenarioLibraryAssets: io.backfill,
}));
vi.mock('../../../composition/archive-transfer', () => ({
  createDirectFileSink: io.pick,
}));
vi.mock('./inventory', () => ({ buildMediaHubBackupExportPlanFromLibraryV6: io.inventory }));
vi.mock('./export', () => ({ exportMediaHubBackupV6: io.write }));
vi.mock('../../../composition/persistence/scenario/resource-sessions', () => ({
  runWithScenarioResourceRead: async (operation: () => Promise<unknown>) => {
    io.active = true;
    try {
      return await operation();
    } finally {
      io.active = false;
    }
  },
}));
import { exportMediaHubBackup } from './public';
beforeEach(() => {
  vi.clearAllMocks();
  io.active = false;
  io.pick.mockImplementation(async () => ({ abort: io.abort }));
  io.inventory.mockImplementation(async () => {
    expect(io.active).toBe(true);
    return {};
  });
  io.write.mockImplementation(async () => {
    expect(io.active).toBe(true);
  });
});
it('protects physical scenario objects from inventory through completion of archive writing', async () => {
  await exportMediaHubBackup();
  expect(io.inventory).toHaveBeenCalledOnce();
  expect(io.backfill).toHaveBeenCalledOnce();
  expect(io.backfill.mock.invocationCallOrder[0]).toBeLessThan(
    io.inventory.mock.invocationCallOrder[0]!
  );
  expect(io.write).toHaveBeenCalledOnce();
  expect(io.active).toBe(false);
  expect(io.abort).not.toHaveBeenCalled();
});
it('releases backup protection and aborts the sink on a failed writer', async () => {
  io.write.mockImplementationOnce(async () => {
    expect(io.active).toBe(true);
    throw new Error('cancelled');
  });
  io.abort.mockResolvedValue(undefined);
  await expect(exportMediaHubBackup()).rejects.toThrow('cancelled');
  expect(io.active).toBe(false);
  expect(io.abort).toHaveBeenCalledOnce();
});

it('aborts without writing when the agreed snapshot is refused, then permits a fresh retry', async () => {
  io.inventory.mockRejectedValueOnce(new Error('Video review changed'));
  io.abort.mockResolvedValue(undefined);
  await expect(exportMediaHubBackup({}, { requireSelected: true })).rejects.toThrow('changed');
  expect(io.write).not.toHaveBeenCalled();
  expect(io.abort).toHaveBeenCalledOnce();
  await exportMediaHubBackup({}, { requireSelected: true });
  expect(io.write).toHaveBeenCalledOnce();
});

it('holds source protection while the file picker waits and through sink abort', async () => {
  io.pick.mockImplementationOnce(async () => {
    expect(io.active).toBe(true);
    return {
      abort: async () => {
        expect(io.active).toBe(true);
      },
    };
  });
  io.write.mockRejectedValueOnce(new Error('write refused'));
  await expect(exportMediaHubBackup()).rejects.toThrow('write refused');
  expect(io.active).toBe(false);
  io.pick.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
  await expect(exportMediaHubBackup()).rejects.toMatchObject({ name: 'AbortError' });
  expect(io.active).toBe(false);
});

it('supplies root preparation under the existing archive reader only in the admitted sync build', async () => {
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
  const signal = new AbortController().signal;
  const root = { rootKind: 'video-project', rootId: 'selected' };
  io.prepare.mockImplementation(async () => {
    expect(io.active).toBe(true);
  });
  io.inventory.mockImplementationOnce(async (_options, admission) => {
    expect(io.active).toBe(true);
    await admission.prepareRoot(root);
    return {};
  });
  try {
    await exportMediaHubBackup({}, { signal });
  } finally {
    vi.unstubAllGlobals();
  }
  expect(io.prepare).toHaveBeenCalledExactlyOnceWith(root, signal);
  expect(io.write).toHaveBeenCalledOnce();
});
it('aborts the archive without writing when selected native preparation fails', async () => {
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
  io.prepare.mockRejectedValueOnce(new Error('Native dependency unavailable'));
  io.inventory.mockImplementationOnce(async (_options, admission) => {
    await admission.prepareRoot({ rootKind: 'media', rootId: 'selected' });
    return {};
  });
  try {
    await expect(exportMediaHubBackup()).rejects.toThrow('Native dependency unavailable');
  } finally {
    vi.unstubAllGlobals();
  }
  expect(io.write).not.toHaveBeenCalled();
  expect(io.abort).toHaveBeenCalledOnce();
});
