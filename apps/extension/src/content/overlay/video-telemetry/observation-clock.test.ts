import { describe, expect, it } from 'vitest';
import { createObservationClock } from './observation-clock';
import type { RecordingFrameClockAnchor } from '../../../contracts/video/recording-frame-clock';

function anchor(overrides: Partial<RecordingFrameClockAnchor> = {}): RecordingFrameClockAnchor {
  return {
    recordingId: 'recording-1',
    generation: 1,
    streamInstanceId: 'stream-1',
    revision: 1,
    phase: 'active',
    captureEpochMs: 1000,
    mediaTimeSeconds: 0,
    uncertaintyMs: 0.25,
    ...overrides,
  };
}

describe('queued cursor phase projection', () => {
  it('projects an old event through its own calibrated phase after Resume', () => {
    const clock = createObservationClock(1000);
    clock.start(100, 0, 0);
    const first = clock.id;
    clock.update(anchor({ captureEpochMs: 1100, mediaTimeSeconds: 2 }));
    clock.end(2.1);
    clock.start(1000, 0.1, 2.1);
    clock.update(anchor({ revision: 3, captureEpochMs: 2000, mediaTimeSeconds: 2.1 }));
    expect(clock.projectAt(first, 0.05)).toEqual({
      activeTimeUs: 2050000,
      clockRevision: 1,
      clock: {
        source: 'dom-event-time',
        timestampQuantumUs: null,
        resolutionBoundUs: null,
        mappingUncertaintyUs: 250,
      },
    });
    expect(clock.projectAt(clock.id, 0.15).activeTimeUs).toBe(2150000);
    expect(clock.projectAt(first, 0.2).activeTimeUs).toBe(2100000);
  });
  it('retains unknown precision until calibration and does not rewrite emitted projections', () => {
    const clock = createObservationClock(1000);
    clock.start(100, 0, 3);
    const before = clock.projectAt(clock.id, 0.01);
    clock.update(anchor({ captureEpochMs: 1100, mediaTimeSeconds: 4, revision: 2 }));
    expect(before.activeTimeUs).toBe(3010000);
    expect(before.clock.mappingUncertaintyUs).toBeNull();
    expect(clock.projectAt(clock.id, 0.01).activeTimeUs).toBe(4010000);
    expect(() => clock.projectAt('unknown', 0)).toThrow('Unknown observation clock phase');
  });
});
