import { expect, it, vi } from 'vitest';
import { createDefaultHighlighterSettings } from '../../../features/highlighter/style/defaults';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { createHighlighterWriteController } from './mutation-write';

const { syncSetMock } = vi.hoisted(() => ({
  syncSetMock: vi.fn(async (_payload: Record<string, unknown>, _permit: unknown) => undefined),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { sync: { set: syncSetMock } },
}));

it('detaches nested preset effects from the write input', async () => {
  const source = createDefaultHighlighterSettings();
  const cacheSettings = vi.fn();
  const controller = createHighlighterWriteController({
    cacheSettings,
    logger: { debug: vi.fn() },
    storageKey: 'settings',
  });

  await runWithPersistenceMutationPermit((permit) => controller.writeSettings(source, permit));

  const persisted = syncSetMock.mock.calls[0]![0]['settings'] as ReturnType<
    typeof createDefaultHighlighterSettings
  >;
  const cached = cacheSettings.mock.calls[0]?.[0];
  const expectedBlurAmount = source.borderPresets[0]!.effects!.blur.amount;
  source.borderPresets[0]!.effects!.blur.amount = expectedBlurAmount + 100;

  expect(persisted.borderPresets[0]!.effects!.blur.amount).toBe(expectedBlurAmount);
  expect(cached.borderPresets[0].effects.blur.amount).toBe(expectedBlurAmount);
  expect(persisted.borderPresets[0]!.effects).not.toBe(source.borderPresets[0]!.effects);
});
