import { describe, expect, it } from 'vitest';
import {
  createBookendImagePresentation,
  createBookendVideoPresentation,
  parseBookendImagePresentation,
  parseBookendVideoPresentation,
} from './bookend-media';

describe('shared bookend settings', () => {
  it('creates independent Gallery defaults without keeping source metadata', () => {
    const image = createBookendImagePresentation();
    const other = createBookendImagePresentation();
    image.crop.panX = 1;
    expect(other).toEqual({
      duration: 3,
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    });
    expect(createBookendVideoPresentation(7200)).toEqual({
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
      trim: { start: 0, end: 7200 },
      audio: { muted: false, gain: 1 },
    });
  });

  it('retains precise trim, dormant gain and crop independently of the source admission budget', () => {
    const value = {
      ...createBookendVideoPresentation(7200),
      fit: 'cover',
      crop: { panX: -0.73125, panY: 0.275 },
      trim: { start: 4000.000123, end: 7000.987654 },
      audio: { muted: true, gain: 1.73 },
    };
    expect(parseBookendVideoPresentation(value, 7200)).toEqual(value);
    expect(parseBookendVideoPresentation(value, 3600)).toBeNull();
    expect(parseBookendVideoPresentation(value, Infinity)).toBeNull();
  });

  it.each([
    { crop: { panX: 1.01, panY: 0 } },
    { crop: { panX: 0, panY: NaN } },
    { crop: { panX: 0, panY: 0, hidden: 1 } },
    { fit: 'stretch' },
    { fillColor: '#00000080' },
    { duration: 0 },
    { duration: 60.001 },
  ])('refuses unsupported image presentation %j', (patch) => {
    expect(
      parseBookendImagePresentation({ ...createBookendImagePresentation(), ...patch })
    ).toBeNull();
  });

  it.each([
    { trim: { start: 5, end: 5 } },
    { trim: { start: -1, end: 5 } },
    { trim: { start: 0, end: 11 } },
    { trim: { start: 0, end: 5, rate: 2 } },
    { audio: { muted: false, gain: 2.01 } },
    { audio: { muted: 'yes', gain: 1 } },
    { audio: { muted: false, gain: 1, unknown: true } },
  ])('refuses unsupported video presentation %j', (patch) => {
    expect(
      parseBookendVideoPresentation({ ...createBookendVideoPresentation(10), ...patch }, 10)
    ).toBeNull();
  });
});
