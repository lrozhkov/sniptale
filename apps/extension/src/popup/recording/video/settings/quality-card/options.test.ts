import { describe, expect, it } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { getQualityIndex, getQualityOption } from './options';

describe('quality card options', () => {
  it('maps known qualities to their indices', () => {
    expect(getQualityIndex(VideoQuality.LOW)).toBe(0);
    expect(getQualityIndex(VideoQuality.MEDIUM)).toBe(1);
    expect(getQualityIndex(VideoQuality.HIGH)).toBe(2);
    expect(getQualityIndex(VideoQuality.ULTRA)).toBe(3);
  });

  it('falls back to the default quality slice for unknown input', () => {
    expect(getQualityIndex('BROKEN' as VideoQuality)).toBe(2);
    expect(getQualityOption('BROKEN' as VideoQuality).value).toBe(VideoQuality.HIGH);
  });

  it('returns translated labels and descriptions for known qualities', () => {
    expect(getQualityOption(VideoQuality.LOW)).toEqual(
      expect.objectContaining({
        description: expect.any(String),
        label: expect.any(String),
        value: VideoQuality.LOW,
      })
    );
  });
});
