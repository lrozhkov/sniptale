import { expect, it } from 'vitest';
import { resolveCursorSample } from '../composition/timeline/frame/cursor';
import { createVideoProjectFromRecording } from './factories/creation';
import { normalizeVideoProjectCursorSkin } from './cursor';
import { applyVideoProjectMutationPatch } from './mutation';
import { isExportReadyVideoProject } from './validation/root';
import { materializeVideoProjectCursorSourceObservations } from './cursor-source-observations';
import type { VideoProject, VideoProjectCursorSample } from './types';

function fixture(samples?: VideoProjectCursorSample[]) {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
  });
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.sourceInstanceId = 'instance';
  clip.startTime = 2;
  clip.sourceStart = 3;
  clip.sourceDuration = 2;
  clip.playbackRate = 2;
  clip.duration = 1;
  return applyVideoProjectMutationPatch(project, {
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: { ...normalizeVideoProjectCursorSkin(undefined), hidden: true },
      samples: [{ id: 'manual', time: 1, x: 4, y: 5, visible: true }],
      sourceObservations: [
        {
          recordingId: 'recording',
          sourceInstanceId: 'instance',
          samples: samples ?? [
            {
              id: 'start',
              time: 0,
              x: 0,
              y: 0,
              visible: true,
              observation: 'observed',
              recordingPoint: { x: 0, y: 0 },
              interpolation: 'EASE_IN_OUT',
            },
            {
              id: 'end',
              time: 8,
              x: 640,
              y: 360,
              visible: true,
              observation: 'observed',
              recordingPoint: { x: 1, y: 1 },
            },
          ],
        },
      ],
    },
  });
}

it('materializes linear captured boundaries at the clip rate while retaining complete source facts', () => {
  const project = fixture();
  const before = structuredClone(project);
  const track = materializeVideoProjectCursorSourceObservations(project)!;
  expect(track.samples.find((sample) => sample.id === 'manual')).toEqual(
    project.cursorTrack!.samples[0]
  );
  const captured = track.samples.filter((sample) => sample.sourceAnchor);
  expect(
    captured.map((sample) => [
      sample.time,
      sample.recordingPoint?.x,
      sample.sourceAnchor?.sourceTime,
    ])
  ).toEqual([
    [2, 3 / 8, 3],
    [3, 5 / 8, 5],
  ]);
  expect(captured.every((sample) => sample.interpolation === 'LINEAR')).toBe(true);
  expect(track.sourceObservations).toBe(project.cursorTrack!.sourceObservations);
  expect(track.sourceObservations![0]!.samples[0]!.interpolation).toBe('EASE_IN_OUT');
  expect(project).toEqual(before);
  const materialized = { ...project, cursorTrack: track };
  expect(isExportReadyVideoProject(materialized)).toBe(true);
  expect(materializeVideoProjectCursorSourceObservations(materialized)).toEqual(track);
});

it('keeps observation gaps and capture boundaries instead of interpolating across them', () => {
  const project = fixture([
    {
      id: 'observed',
      time: 0,
      x: 0,
      y: 0,
      visible: true,
      observation: 'observed',
      captureSegment: 0,
      recordingPoint: { x: 0, y: 0 },
    },
    {
      id: 'outside',
      time: 2,
      x: 0,
      y: 0,
      visible: false,
      observation: 'outside',
      captureSegment: 0,
      recordingPoint: null,
    },
    {
      id: 'return',
      time: 4,
      x: 640,
      y: 360,
      visible: true,
      observation: 'observed',
      captureSegment: 1,
      recordingPoint: { x: 1, y: 1 },
    },
    {
      id: 'end',
      time: 8,
      x: 320,
      y: 180,
      visible: true,
      observation: 'observed',
      captureSegment: 1,
      recordingPoint: { x: 0.5, y: 0.5 },
    },
  ]);
  const samples = materializeVideoProjectCursorSourceObservations(project)!.samples.filter(
    (sample) => sample.sourceAnchor
  );
  expect(samples[0]).toMatchObject({
    time: 2,
    visible: false,
    observation: 'outside',
    recordingPoint: null,
  });
  expect(samples[1]).toMatchObject({
    time: 2.5,
    recordingPoint: { x: 1, y: 1 },
    captureSegment: 1,
  });
  expect(samples[2]).toMatchObject({
    time: 3,
    recordingPoint: { x: 0.875, y: 0.875 },
    captureSegment: 1,
  });
});

it('leaves legacy tracks unchanged and isolates another source instance of the recording', () => {
  const project = fixture();
  const clip = project.clips[0]!;
  const other = { ...clip, id: 'other', sourceInstanceId: 'other', startTime: 5 };
  project.clips.push(other);
  const track = materializeVideoProjectCursorSourceObservations(project)!;
  expect(
    track.samples
      .filter((sample) => sample.sourceAnchor)
      .every((sample) => sample.sourceAnchor?.sourceClipId === clip.id)
  ).toBe(true);
  const legacy = { ...project, cursorTrack: { ...track } };
  delete legacy.cursorTrack.sourceObservations;
  expect(materializeVideoProjectCursorSourceObservations(legacy)).toBe(legacy.cursorTrack);
  expect(
    materializeVideoProjectCursorSourceObservations({ ...project, cursorTrack: null })
  ).toBeNull();
});

it('does not invent observations before the first captured sample or across a clock change', () => {
  const project = fixture([
    {
      id: 'late',
      time: 4,
      x: 0,
      y: 0,
      visible: true,
      observation: 'observed',
      observationClockId: 'a',
      recordingPoint: { x: 0, y: 0 },
    },
    {
      id: 'clock-change',
      time: 6,
      x: 640,
      y: 360,
      visible: true,
      observation: 'observed',
      observationClockId: 'b',
      recordingPoint: { x: 1, y: 1 },
    },
  ]);
  const samples = materializeVideoProjectCursorSourceObservations(project)!.samples.filter(
    (sample) => sample.sourceAnchor
  );
  expect(samples.map((sample) => sample.sourceAnchor?.sourceTime)).toEqual([4, 5]);
  expect(samples[1]!.recordingPoint).toEqual({ x: 0, y: 0 });
});

it('preserves skin and interpolation edits during regeneration without rewriting captured points', () => {
  const project = fixture();
  const track = materializeVideoProjectCursorSourceObservations(project)!;
  const sample = track.samples.find((item) => item.sourceAnchor)!;
  sample.skinOverride = { ...track.skin, hidden: false, color: '#ff0000' };
  sample.interpolation = 'EASE_OUT';
  const changed = materializeVideoProjectCursorSourceObservations({
    ...project,
    cursorTrack: track,
  })!;
  expect(changed.samples.find((item) => item.id === sample.id)).toMatchObject({
    skinOverride: { hidden: false, color: '#ff0000' },
    interpolation: 'EASE_OUT',
    recordingPoint: { x: 3 / 8, y: 3 / 8 },
  });
  expect(changed.sourceObservations).toBe(track.sourceObservations);
  sample.skinOverride = null;
  expect(
    materializeVideoProjectCursorSourceObservations({
      ...project,
      cursorTrack: track,
    })!.samples.find((item) => item.id === sample.id)!.skinOverride
  ).toBeNull();
});

it('retains a supported full recording above the sparse authoring limit without relaxing legacy manual tracks', () => {
  const project = fixture(
    Array.from({ length: 10001 }, (_, index) => ({
      id: `capture-${index}`,
      time: (index * 8) / 10000,
      x: (index * 640) / 10000,
      y: 180,
      visible: true,
      recordingPoint: { x: index / 10000, y: 0.5 },
      observation: 'observed' as const,
    }))
  );
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.startTime = 0;
  clip.sourceStart = 0;
  clip.sourceDuration = 8;
  clip.playbackRate = 1;
  clip.duration = 8;
  project.cursorTrack!.samples = [];
  const track = materializeVideoProjectCursorSourceObservations(project)!;
  const captured = { ...project, cursorTrack: track };
  expect(track.sourceObservations![0]!.samples).toHaveLength(10001);
  expect(track.samples).toHaveLength(10001);
  expect(isExportReadyVideoProject(captured)).toBe(true);
  expect(isExportReadyVideoProject(JSON.parse(JSON.stringify(captured)))).toBe(true);
  const legacy = { ...captured, cursorTrack: { ...track } };
  delete legacy.cursorTrack.sourceObservations;
  expect(isExportReadyVideoProject(legacy)).toBe(false);
  expect(
    isExportReadyVideoProject({
      ...captured,
      cursorTrack: { ...track, samples: [...track.samples, ...track.samples, ...track.samples] },
    })
  ).toBe(false);
});

it('refuses groups bound to different assets or overflowing unrelated manual authoring', () => {
  const project = fixture();
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  const otherAsset = { ...project.assets[0]!, id: 'different-camera-asset' };
  const otherClip = { ...clip, id: 'different-clip', assetId: otherAsset.id };
  expect(
    isExportReadyVideoProject({
      ...project,
      assets: [...project.assets, otherAsset],
      clips: [...project.clips, otherClip],
    })
  ).toBe(false);
  const track = materializeVideoProjectCursorSourceObservations(project)!;
  const manual = Array.from({ length: 5001 }, (_, index) => ({
    id: `manual-${index}`,
    time: 0,
    x: 0,
    y: 0,
    visible: true,
  }));
  expect(
    isExportReadyVideoProject({ ...project, cursorTrack: { ...track, samples: manual } })
  ).toBe(false);
  expect(
    isExportReadyVideoProject({
      ...project,
      cursorTrack: { ...track, sourceObservations: [], samples: manual },
    })
  ).toBe(false);
});

it.each([
  {
    offset: 0.5,
    duration: 1.2,
    positions: [
      [2, 4],
      [2.25, 4.5],
      [3.2, 4.5],
    ],
  },
  {
    offset: 1,
    duration: 0.2,
    positions: [
      [2, 4.5],
      [2.2, 4.5],
    ],
  },
])(
  'keeps captured cursor samples inside a physical playback slice with offset $offset',
  ({ offset, duration, positions }) => {
    const original = fixture();
    const before = structuredClone(original);
    const candidate: VideoProject = {
      ...original,
      version: 43,
      clips: original.clips.map((clip) => ({
        ...clip,
        duration,
        playbackWindow: { offset, holdAt: 0.75 },
      })),
      cursorTrack: {
        ...original.cursorTrack!,
        captureMode: 'separate' as const,
        skin: { ...original.cursorTrack!.skin, hidden: false },
      },
    };
    const track = materializeVideoProjectCursorSourceObservations(candidate)!;
    const projected = track.samples.filter((sample) => sample.sourceAnchor);
    expect(projected.map((sample) => [sample.time, sample.sourceAnchor!.sourceTime])).toEqual(
      positions
    );
    const ready = { ...candidate, cursorTrack: track };
    expect(isExportReadyVideoProject(ready)).toBe(true);
    for (const time of [1.99, 2 + duration + 0.01]) {
      const invalid = {
        ...ready,
        cursorTrack: { ...track, samples: [{ ...projected[0]!, time }] },
      };
      expect(isExportReadyVideoProject(invalid)).toBe(false);
    }
    const wrongSource = {
      ...projected.at(-1)!,
      sourceAnchor: { ...projected.at(-1)!.sourceAnchor!, sourceTime: 4.6 },
    };
    expect(
      isExportReadyVideoProject({ ...ready, cursorTrack: { ...track, samples: [wrongSource] } })
    ).toBe(false);
    const held = resolveCursorSample(ready, 2 + duration - 0.01)!;
    expect(held.recordingPoint?.x).toBeCloseTo(4.5 / 8, 12);
    expect(materializeVideoProjectCursorSourceObservations(ready)).toEqual(track);
    expect(track.sourceObservations).toBe(original.cursorTrack!.sourceObservations);
    expect(original).toEqual(before);
  }
);
