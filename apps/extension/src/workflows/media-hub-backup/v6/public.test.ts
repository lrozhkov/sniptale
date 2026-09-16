import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  active: false,
  inventory: vi.fn(),
  write: vi.fn(),
  abort: vi.fn(),
}));
vi.mock('../../../composition/archive-transfer', () => ({
  createDirectFileSink: async () => ({ abort: io.abort }),
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
