import { describe, expect, it } from 'vitest';
import {
  normalizeRecordingFrameClockLease,
  isRecordingFrameClockAnchor,
  RECORDING_FRAME_CLOCK_PURPOSE,
} from './recording-frame-clock';

const binding = { recordingId: 'recording', generation: 2, streamInstanceId: 'source' };
const lease = {
  ...binding,
  purpose: RECORDING_FRAME_CLOCK_PURPOSE,
  nonce: 'ba289176-c099-44d5-8f18-174e05565080',
  expiresAtEpochMs: 1,
};

describe('advisory frame clock contracts', () => {
  it('retains an expired syntactically valid lease for observer-only admission', () => {
    expect(normalizeRecordingFrameClockLease(lease, binding)).toEqual(lease);
  });
  it.each([
    null,
    {},
    { ...lease, purpose: 'other' },
    { ...lease, generation: 3 },
    { ...lease, nonce: 'bad' },
    { ...lease, extra: true },
  ])('normalizes malformed or wrong-source optional metadata to unavailable', (input) => {
    expect(normalizeRecordingFrameClockLease(input, binding)).toBeNull();
  });
  it('rejects invalid exact anchors instead of substituting a receipt timestamp', () => {
    const anchor = {
      ...binding,
      revision: 1,
      phase: 'active',
      captureEpochMs: 1234,
      mediaTimeSeconds: 0,
    };
    expect(isRecordingFrameClockAnchor(anchor)).toBe(true);
    for (const invalid of [
      { ...anchor, captureEpochMs: NaN },
      { ...anchor, revision: 0 },
      { ...anchor, mediaTimeSeconds: -1 },
      { ...anchor, phase: 'receipt' },
    ])
      expect(isRecordingFrameClockAnchor(invalid)).toBe(false);
  });
});
