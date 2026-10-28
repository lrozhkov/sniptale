import { expect, it, vi } from 'vitest';
import { emptySummary } from '../../../workflows/settings-transfer/planner';
const mocks = vi.hoisted(() => ({
  get: vi.fn(async () => ({})),
  set: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { local: mocks, sync: mocks },
}));
import { applySettingsTransferDomains } from './apply';
const paletteSlots = () =>
  Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`slot-${index}`, '#ff7f50']));

it('restores the named palette DTO without dropping RGB metadata', async () => {
  await applySettingsTransferDomains({
    domains: {
      'styles.palettes': {
        schemaVersion: 1,
        data: {
          slots: paletteSlots(),
          names: { '#ff7f50': 'Brand coral', '#663399': 'Scene violet' },
        },
      },
    },
    summary: emptySummary(),
  });
  expect(mocks.set).toHaveBeenCalledWith(
    expect.objectContaining({
      sniptale_drawing_palette: expect.objectContaining({
        names: { '#ff7f50': 'Brand coral', '#663399': 'Scene violet' },
      }),
    }),
    undefined
  );
});
