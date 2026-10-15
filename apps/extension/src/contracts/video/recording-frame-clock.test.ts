import { describe, expect, it } from 'vitest';
import { isRecordingFrameClockAnchor } from './recording-frame-clock';

const binding = { recordingId: 'recording', generation: 2, streamInstanceId: 'source' };
describe('advisory frame clock contracts', () => {
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
