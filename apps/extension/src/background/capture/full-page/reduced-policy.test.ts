import { expect, it } from 'vitest';
import { FULL_PAGE_FILE_BUDGET_ERROR, FULL_PAGE_RASTER_BUDGET_ERROR } from './budgets';
import { resolveReducedExportPolicy } from './reduced-policy';

const maximumPolicy = {
  maxFileSizeMiB: 128,
  maxMegapixels: 80,
  minScalePercent: 100,
  profile: 'maximum' as const,
};

it('reduces both scale floor and raster area after an oversized encoded file', () => {
  expect(resolveReducedExportPolicy(maximumPolicy, new Error(FULL_PAGE_FILE_BUDGET_ERROR))).toEqual(
    {
      maxFileSizeMiB: 128,
      maxMegapixels: 30,
      minScalePercent: 10,
      profile: 'custom',
    }
  );
});

it('retains the raster ceiling when only the configured scale floor was too high', () => {
  expect(
    resolveReducedExportPolicy(maximumPolicy, new Error(FULL_PAGE_RASTER_BUDGET_ERROR))
  ).toEqual({
    maxFileSizeMiB: 128,
    maxMegapixels: 80,
    minScalePercent: 10,
    profile: 'custom',
  });
});
