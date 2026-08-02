import { describe, expect, it } from 'vitest';

import { requireRecordingDimensions } from './dimensions';

describe('requireRecordingDimensions', () => {
  it('returns positive integer dimensions', () => {
    expect(
      requireRecordingDimensions(
        { trackSettings: { height: 720, width: 1280 } },
        'dimensions unavailable'
      )
    ).toEqual({ height: 720, width: 1280 });
  });

  it.each([
    {},
    { height: 720 },
    { height: 720, width: 0 },
    { height: -1, width: 1280 },
    { height: 720.5, width: 1280 },
    { height: 720, width: 1280.5 },
  ] satisfies MediaTrackSettings[])('rejects invalid track settings %#', (trackSettings) => {
    expect(() => requireRecordingDimensions({ trackSettings }, 'dimensions unavailable')).toThrow(
      'dimensions unavailable'
    );
  });
});
