import { expect, it } from 'vitest';
import { parseSettingsTransferDomains } from './domain-parser';
import type {
  SettingsTransferDomainPayload,
  SettingsTransferJsonValue,
} from '../../contracts/settings-transfer';

function packageWithPolicy(
  fullPageQuality: SettingsTransferJsonValue
): Record<string, SettingsTransferDomainPayload> {
  return {
    'capture.image': {
      schemaVersion: 1,
      data: { fullPageQuality },
    },
  };
}

it('accepts a bounded custom full-page quality policy from settings import', () => {
  expect(
    parseSettingsTransferDomains(
      packageWithPolicy({
        maxFileSizeMiB: 72,
        maxMegapixels: 70,
        minScalePercent: 40,
        profile: 'custom',
      })
    )['capture.image']?.data
  ).toEqual({
    fullPageQuality: {
      maxFileSizeMiB: 72,
      maxMegapixels: 70,
      minScalePercent: 40,
      profile: 'custom',
    },
  });
});

it('accepts the canonical maximum-quality profile from settings import', () => {
  expect(
    parseSettingsTransferDomains(
      packageWithPolicy({
        maxFileSizeMiB: 128,
        maxMegapixels: 80,
        minScalePercent: 100,
        profile: 'maximum',
      })
    )['capture.image']?.data
  ).toEqual({
    fullPageQuality: {
      maxFileSizeMiB: 128,
      maxMegapixels: 80,
      minScalePercent: 100,
      profile: 'maximum',
    },
  });
});

it.each([0, -1, 129])('rejects an unsafe imported maximum file size: %s', (maxFileSizeMiB) => {
  expect(() =>
    parseSettingsTransferDomains(
      packageWithPolicy({
        maxFileSizeMiB,
        maxMegapixels: 64,
        minScalePercent: 50,
        profile: 'custom',
      })
    )
  ).toThrow('Invalid settings domain payload: capture.image');
});
