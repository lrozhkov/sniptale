import { expect, it, vi } from 'vitest';
import { createDefaultHighlighterSettings } from '../../../features/highlighter/style/defaults';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { createHighlighterWriteController } from './mutation-write';
import { parseStoredHighlighterSettings } from './guards';
import { resolveLoadedHighlighterSettings } from './resolved';

const { syncSetMock } = vi.hoisted(() => ({
  syncSetMock: vi.fn(async (_payload: Record<string, unknown>, _permit: unknown) => undefined),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { sync: { set: syncSetMock } },
}));

it('stores canonical systems compactly and restores detached full visual snapshots', async () => {
  const source = createDefaultHighlighterSettings();
  source.borderPresets[0]!.tagIds = [];
  source.borderPresets[1]!.tagIds = ['tag-one'];
  const cacheSettings = vi.fn();
  const controller = createHighlighterWriteController({
    cacheSettings,
    logger: { debug: vi.fn() },
    storageKey: 'settings',
  });

  await runWithPersistenceMutationPermit((permit) => controller.writeSettings(source, permit));

  const persisted = syncSetMock.mock.calls[0]![0]['settings'] as Record<string, unknown>;
  const cached = cacheSettings.mock.calls[0]?.[0];
  const expectedBlurAmount = source.borderPresets[0]!.effects!.blur.amount;
  source.borderPresets[0]!.effects!.blur.amount = expectedBlurAmount + 100;

  expect((persisted['borderPresets'] as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
    'effects'
  );
  expect(new TextEncoder().encode(`settings${JSON.stringify(persisted)}`).byteLength).toBeLessThan(
    7_500
  );
  expect(cached.borderPresets[0].effects.blur.amount).toBe(expectedBlurAmount);
  expect(cached.borderPresets[0]!.effects).not.toBe(source.borderPresets[0]!.effects);

  const parsed = parseStoredHighlighterSettings(persisted);
  expect(parsed.invalidFieldCount).toBe(0);
  const restored = resolveLoadedHighlighterSettings(
    parsed.value.borderPresets,
    parsed.value.defaultBorderPresetId,
    parsed.value
  ).borderPresets;
  expect(restored[0]!.tagIds).toEqual([]);
  expect(restored[1]!.tagIds).toEqual(['tag-one']);
  expect(restored.slice(2)).toEqual(createDefaultHighlighterSettings().borderPresets.slice(2));
});
