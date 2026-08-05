import { beforeEach, expect, it, vi } from 'vitest';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { resolveStoredStepBadgePresetCatalog } from './migration';

const set = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()).browserStorage,
    sync: { get: vi.fn(), set },
  },
}));

import { createStepBadgePresetWriteController, StepBadgePresetQuotaError } from './storage';

beforeEach(() => set.mockClear());

it('serializes writes, caches after commit, and recovers the queue', async () => {
  const cache = vi.fn();
  const controller = createStepBadgePresetWriteController({
    cache,
    storageKey: 'sniptale_step_badge_presets',
  });
  await expect(
    controller.enqueueWrite(async () => Promise.reject(new Error('failed')))
  ).rejects.toThrow('failed');
  await expect(controller.enqueueWrite(async () => 'recovered')).resolves.toBe('recovered');
  await runWithPersistenceMutationPermit((permit) =>
    controller.writeCatalog(resolveStoredStepBadgePresetCatalog({}), permit)
  );
  expect(set).toHaveBeenCalledOnce();
  expect(cache).toHaveBeenCalledOnce();
});

it('rejects over-budget writes before storage', async () => {
  const controller = createStepBadgePresetWriteController({
    cache: vi.fn(),
    storageKey: 'x'.repeat(8_000),
  });
  await expect(
    runWithPersistenceMutationPermit((permit) =>
      controller.writeCatalog(resolveStoredStepBadgePresetCatalog({}), permit)
    )
  ).rejects.toBeInstanceOf(StepBadgePresetQuotaError);
  expect(set).not.toHaveBeenCalled();
});
