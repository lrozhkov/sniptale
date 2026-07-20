import { describe, expect, it } from 'vitest';
import {
  formatPlaybackRateLabel,
  getPlaybackRateSliderProps,
  mapSliderValueToPlaybackRate,
} from './rate-slider';

describe('playback-rate-slider', () => {
  it('maps playback rate extremes into the slider domain', () => {
    expect(getPlaybackRateSliderProps(0.1)).toEqual({
      min: 0,
      max: 100,
      step: 1,
      value: 0,
    });
    expect(getPlaybackRateSliderProps(16)).toEqual({
      min: 0,
      max: 100,
      step: 1,
      value: 100,
    });
  });

  it('round-trips representative playback rates through the slider mapping', () => {
    const rates = [0.1, 0.25, 1, 2.25, 8, 16];

    expect(
      rates.map((rate) => mapSliderValueToPlaybackRate(getPlaybackRateSliderProps(rate).value))
    ).toEqual([0.1, 0.25, 1, 2.25, 8, 16]);
  });

  it('keeps the left edge bounded to a safe slow-motion rate', () => {
    expect(mapSliderValueToPlaybackRate(0)).toBe(0.1);
  });

  it('formats sub-1x and standard playback labels canonically', () => {
    expect(formatPlaybackRateLabel(0.1)).toBe('0.100x');
    expect(formatPlaybackRateLabel(0.25)).toBe('0.250x');
    expect(formatPlaybackRateLabel(8)).toBe('8.00x');
  });
});
