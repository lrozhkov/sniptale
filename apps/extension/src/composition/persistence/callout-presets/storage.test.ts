import { beforeEach, expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';

const set = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()).browserStorage,
    sync: { get: vi.fn(), set },
  },
}));

import { CalloutPresetQuotaError, createCalloutPresetWriteController } from './storage';

function createCatalog() {
  return {
    catalogCustomized: false,
    defaultPresetId: 'system-callout-bubble',
    presets: createSystemCalloutPresetCatalog(),
    systemCatalogRevision: 1,
  };
}

beforeEach(() => set.mockClear());

it('serializes writes and caches only after a committed storage mutation', async () => {
  const order: string[] = [];
  const cacheCatalog = vi.fn();
  const controller = createCalloutPresetWriteController({
    cacheCatalog,
    storageKey: 'sniptale_callout_presets',
  });
  let release: (() => void) | undefined;
  const first = controller.enqueueWrite(async () => {
    order.push('first-start');
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    order.push('first-end');
  });
  const second = controller.enqueueWrite(async () => order.push('second'));
  await vi.waitFor(() => expect(order).toEqual(['first-start']));
  release?.();
  await Promise.all([first, second]);
  expect(order).toEqual(['first-start', 'first-end', 'second']);

  await runWithPersistenceMutationPermit((permit) =>
    controller.writeCatalog(createCatalog(), permit)
  );
  expect(set).toHaveBeenCalledOnce();
  expect(cacheCatalog).toHaveBeenCalledOnce();
});

it('continues the queue after rejection and rejects oversized catalog writes before storage', async () => {
  const controller = createCalloutPresetWriteController({
    cacheCatalog: vi.fn(),
    storageKey: 'x'.repeat(8_000),
  });
  await expect(
    controller.enqueueWrite(async () => Promise.reject(new Error('failed')))
  ).rejects.toThrow('failed');
  await expect(controller.enqueueWrite(async () => 'recovered')).resolves.toBe('recovered');
  await expect(
    runWithPersistenceMutationPermit((permit) => controller.writeCatalog(createCatalog(), permit))
  ).rejects.toBeInstanceOf(CalloutPresetQuotaError);
  expect(set).not.toHaveBeenCalled();
});
