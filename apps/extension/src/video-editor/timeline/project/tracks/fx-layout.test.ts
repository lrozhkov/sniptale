import { packTimelineFxRows, resolveTimelineFxCoverage } from './fx-layout';
import { expect, it } from 'vitest';
import { createTimelineTestProps } from '../test-support';
import { buildTimelineTrackLayoutModel } from './layout';

it.each(['clip', 'track', 'video-group'] as const)(
  'packs adjacent %s effects while keeping processing order and overlaps intact',
  (scope) => {
    const { project } = createTimelineTestProps();
    const clip = project.clips[0]!;
    project.effectInstances = Array.from({ length: 8 }, (_, index) => ({
      id: `fx-${index}`,
      kind: 'targetEffect',
      target:
        scope === 'clip'
          ? { kind: 'clip', clipId: clip.id }
          : scope === 'track'
            ? { kind: 'track', trackId: clip.trackId }
            : { kind: 'video-group' },
      snapshotId: 'snapshot',
      controls: {},
      enabled: index !== 2,
      playbackRate: 1,
      startTime: index,
      duration: 1,
    }));
    project.effectInstances.reverse();
    const original = structuredClone(project.effectInstances);
    const layout = () => {
      const model = buildTimelineTrackLayoutModel({
        project,
        tracks: project.tracks,
        trackHeightByTrackId: {},
      });
      return scope === 'video-group' ? model.videoFx! : model.layoutByTrackId.get(clip.trackId)!;
    };
    expect(layout().fxHeight).toBe(24);
    expect(project.effectInstances).toEqual(original);
    project.effectInstances.push({ ...original[0]!, id: 'overlap', startTime: 0.5, duration: 3 });
    expect(layout().fxHeight).toBe(48);
  }
);

it('keeps gaps in collapsed coverage and uses stable rows for equal start times', () => {
  const instances = [
    { id: 'a', startTime: 0, duration: 2 },
    { id: 'b', startTime: 0, duration: 1 },
    { id: 'c', startTime: 1, duration: 1 },
    { id: 'd', startTime: 4, duration: 1 },
  ].map((range) => ({
    ...range,
    kind: 'targetEffect' as const,
    target: { kind: 'video-group' as const },
    snapshotId: 'snapshot',
    controls: {},
    enabled: true,
    playbackRate: 1,
  }));
  expect(packTimelineFxRows(instances)).toEqual([
    ['a', 'd'],
    ['b', 'c'],
  ]);
  expect(resolveTimelineFxCoverage(instances)).toEqual([
    { startTime: 0, duration: 2 },
    { startTime: 4, duration: 1 },
  ]);
});
