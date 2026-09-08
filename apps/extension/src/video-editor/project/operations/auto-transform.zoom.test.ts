import { expect, it } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { buildAutoZoomRegions } from './auto-transform.zoom';
const recordingId = 'rec-asset-video';
const telemetry: RecordingTelemetryEntry = {
  recordingId,
  createdAt: 1,
  updatedAt: 1,
  captureMode: 'TAB',
  viewport: null,
  cursorTrack: null,
  actionEvents: [],
  signals: [],
};
function fixture() {
  const project = createProject([
    createVideoClip({ id: 'first', sourceInstanceId: 'instance', startTime: 5 }),
    createVideoClip({ id: 'repeat', sourceInstanceId: 'instance', startTime: 18 }),
  ]);
  project.duration = 26;
  project.actionEvents = [
    {
      id: 'click',
      kind: 'CLICK',
      label: 'Click',
      data: {},
      point: { x: 0.5, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId,
        sourceInstanceId: 'instance',
        sourceEventId: 'raw-click',
        sourceTime: 1,
      },
    },
  ];
  return project;
}
it('projects exact repeated appearances to scene focus, retaining per-occurrence IDs and targets', () => {
  const project = fixture();
  const regions = buildAutoZoomRegions({ project, recordingId, telemetry });
  expect(regions).toHaveLength(2);
  expect(regions.map((region) => region.startTime)).toEqual([6, 19]);
  expect(regions.map((region) => region.targetAction)).toEqual([
    { eventId: 'click', clipId: 'first' },
    { eventId: 'click', clipId: 'repeat' },
  ]);
  expect(new Set(regions.map((region) => region.id)).size).toBe(2);
  expect(regions[0]?.focusPoint).toEqual({ x: 640, y: 360 });
  expect(regions[1]?.sourceBinding).toMatchObject({ clipId: 'repeat', sourceStart: 1 });
  expect(
    regions.every(
      (region) =>
        region.startTime + region.duration <= (region.targetAction?.clipId === 'first' ? 13 : 26)
    )
  ).toBe(true);
  expect(
    buildAutoZoomRegions({
      project: { ...project, motionRegions: regions },
      recordingId,
      telemetry,
    })
  ).toEqual(regions);
});
it('uses source point overrides through the selected clip transform and rejects unavailable geometry', () => {
  const project = fixture();
  project.actionEvents[0]!.presentation = { point: { x: 0.25, y: 0.25 }, enabled: false };
  const clip = project.clips[0]!;
  clip.transform = { ...clip.transform, x: 100, y: 50, width: 640, height: 360 };
  const regions = buildAutoZoomRegions({ project, recordingId, telemetry });
  expect(regions[0]?.focusPoint).toEqual({ x: 260, y: 140 });
  project.actionEvents[0]!.presentation = { point: { x: -1, y: 0.25 } };
  expect(buildAutoZoomRegions({ project, recordingId, telemetry })).toEqual([]);
});
it('preserves manual and other-recording automatic regions instead of replacing the whole camera lane', () => {
  const project = fixture();
  project.actionEvents.push({
    id: 'other',
    kind: 'CLICK',
    label: 'Other',
    data: {},
    point: null,
    anchor: {
      kind: 'recording-source',
      recordingId: 'other-recording',
      sourceInstanceId: 'other-instance',
      sourceEventId: 'other-raw',
      sourceTime: 1,
    },
  });
  const manual = {
    ...createVideoProjectMotionRegion(project, 0),
    id: 'manual',
    targetAction: { eventId: 'click', clipId: 'first' },
  };
  const foreign = {
    ...createVideoProjectMotionRegion(project, 10),
    id: 'auto-motion:foreign',
    targetAction: { eventId: 'other', clipId: 'foreign' },
  };
  project.motionRegions = [manual, foreign];
  const regions = buildAutoZoomRegions({ project, recordingId, telemetry });
  expect(regions).toContain(manual);
  expect(regions).toContain(foreign);
  expect(regions.filter((region) => region.targetAction?.eventId === 'click')).toHaveLength(2);
});

it('keeps a locked camera lane unchanged', () => {
  const project = fixture();
  project.utilityLanes = {
    actions: { visible: true, locked: false },
    camera: { visible: true, locked: true },
  };
  const manual = createVideoProjectMotionRegion(project, 0);
  project.motionRegions = [manual];
  expect(buildAutoZoomRegions({ project, recordingId, telemetry })).toBe(project.motionRegions);
});
it('limits generated framing to an explicitly selected clip while preserving existing repeat framing', () => {
  const project = fixture();
  const original = buildAutoZoomRegions({ project, recordingId, telemetry });
  project.motionRegions = original;
  const regions = buildAutoZoomRegions({
    project,
    recordingId,
    telemetry,
    clipIds: new Set(['first']),
  });
  expect(regions.find((region) => region.targetAction?.clipId === 'repeat')).toBe(
    original.find((region) => region.targetAction?.clipId === 'repeat')
  );
  expect(regions.filter((region) => region.targetAction?.clipId === 'first')).toHaveLength(1);
});

it('does not suggest framing over a manual zoom or its connection', () => {
  const project = fixture();
  const first = { ...createVideoProjectMotionRegion(project, 5), duration: 0.5 };
  const second = { ...createVideoProjectMotionRegion(project, 10), duration: 2 };
  second.incomingConnection = { fromRegionId: first.id, easing: first.easing };
  project.motionRegions = [first, second];
  const regions = buildAutoZoomRegions({ project, recordingId, telemetry });
  expect(
    regions
      .filter((region) => region.id.startsWith('auto-motion:'))
      .map((region) => region.startTime)
  ).toEqual([19]);
});
