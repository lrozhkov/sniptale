import { beforeEach, expect, it, vi } from 'vitest';
import { createDefaultHighlighterSettings } from '../../../features/highlighter/style/defaults';

const { syncGetMock, translateMock } = vi.hoisted(() => ({
  syncGetMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    sync: {
      get: syncGetMock,
      set: vi.fn(),
    },
  },
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

async function loadHighlighterStorage() {
  return import('./index');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

it('returns detached cached snapshots to callers', async () => {
  syncGetMock.mockResolvedValue({
    sniptale_highlighter_settings: createDefaultHighlighterSettings(),
  });

  const { getLoadedHighlighterSettingsSnapshot, loadHighlighterSettings } =
    await loadHighlighterStorage();

  const loaded = await loadHighlighterSettings();
  const expectedBlurAmount = loaded.borderPresets[0]!.effects!.blur.amount;

  loaded.borderPresets[0]!.effects!.blur.amount = expectedBlurAmount + 100;

  const firstSnapshot = getLoadedHighlighterSettingsSnapshot();
  const secondSnapshot = getLoadedHighlighterSettingsSnapshot();

  expect(firstSnapshot).toEqual(createDefaultHighlighterSettings());
  expect(secondSnapshot).toEqual(createDefaultHighlighterSettings());
  expect(firstSnapshot).not.toBe(secondSnapshot);
  expect(firstSnapshot!.borderPresets[0]!.effects!.blur.amount).toBe(expectedBlurAmount);
  expect(firstSnapshot!.borderPresets[0]!.effects).not.toBe(
    secondSnapshot!.borderPresets[0]!.effects
  );
  expect(firstSnapshot!.borderPresets[0]!.effects!.blur).not.toBe(
    secondSnapshot!.borderPresets[0]!.effects!.blur
  );
});
