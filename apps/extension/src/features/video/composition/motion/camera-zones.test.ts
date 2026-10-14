import { describe, expect, it } from 'vitest';
import { groupCameraWorkingZones } from './camera-zones';

const viewport = { width: 1000, height: 600 };
const point = (time: number, x: number, segmentId = 'source') => ({ time, x, y: 100, segmentId });

describe('camera working zones', () => {
  it('holds one activity-centered zone through pointer jitter', () => {
    const zones = groupCameraWorkingZones(
      [point(0, 560), point(1, 580), point(2, 560)],
      viewport,
      0.55
    );
    expect(zones).toHaveLength(1);
    expect(zones[0]?.preferred).toEqual({ x: 570, y: 100 });
  });

  it('weights elapsed output time and remains invariant under linear sample refinement', () => {
    const coarse = [point(0, 200), point(0.1, 600), point(0.9, 600), point(1, 200)];
    const refined = [
      point(0, 200),
      point(0.05, 400),
      ...coarse.slice(1, 3),
      point(0.95, 400),
      point(1, 200),
    ];
    expect(groupCameraWorkingZones(coarse, viewport, 0.55)[0]?.preferred.x).toBeCloseTo(560);
    expect(groupCameraWorkingZones(refined, viewport, 0.55)[0]?.preferred.x).toBeCloseTo(560);
  });

  it('integrates manual framing preference in time, independently of linear sample refinement', () => {
    const coarse = [
      { ...point(0, 200), preferenceWeight: 1 },
      { ...point(1, 600), preferenceWeight: 4 },
    ];
    const refined = [coarse[0]!, { ...point(0.5, 400), preferenceWeight: 2.5 }, coarse[1]!];
    const original = groupCameraWorkingZones(coarse, viewport, 0.55)[0]!.preferred;
    expect(original.x).toBeCloseTo(440);
    expect(groupCameraWorkingZones(refined, viewport, 0.55)[0]!.preferred).toEqual(original);
  });

  it('merges compatible spread when zone size grows and keeps source boundaries explicit', () => {
    const observations = [point(0, 0), point(1, 300), point(2, 500), point(3, 500, 'resumed')];
    expect(groupCameraWorkingZones(observations, viewport, 0.35)).toHaveLength(3);
    expect(groupCameraWorkingZones(observations, viewport, 0.55)).toHaveLength(2);
    expect(groupCameraWorkingZones(observations, viewport, 0.55)[1]?.segmentId).toBe('resumed');
  });
});
