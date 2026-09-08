import { expect, it } from 'vitest';
import { createProject, createVideoClip } from '../timeline/project-meta.test.helpers.ts';
import { VideoCursorCaptureMode, VideoProjectSourceKind } from '../types/index';
import { hydrateVideoProject } from './index';
import { createVideoProjectCursorTrack } from '../defaults';
import { resolveVideoProjectActionOccurrences } from '../action-occurrences';
import { isExportReadyVideoProject } from '../validation/root';

it.each([null, 'recording-1'])('preserves explicit multi-source anchors with base %s', (base) => {
  const project = createProject([
    createVideoClip(),
    createVideoClip({
      id: 'second-instance',
      sourceInstanceId: 'second-source',
      assetId: 'second-asset',
      startTime: 8,
      sourceStart: 2,
      sourceDuration: 4,
      playbackRate: 2,
      duration: 2,
    }),
    createVideoClip({
      id: 'repeat-instance',
      sourceInstanceId: 'repeat-source',
      assetId: 'second-asset',
      startTime: 12,
    }),
  ]);
  project.baseRecordingId = base;
  project.duration = 20;
  project.assets.push({
    ...project.assets[0]!,
    id: 'second-asset',
    source: {
      kind: 'project-asset',
      projectAssetId: 'copied',
      originRecordingId: 'second-recording',
    },
  });
  const anchor = {
    kind: 'recording-source' as const,
    recordingId: 'second-recording',
    sourceClipId: 'second-instance',
    sourceTime: 4,
  };
  const factAnchor = {
    kind: 'recording-source' as const,
    recordingId: 'second-recording',
    sourceInstanceId: 'second-source',
    sourceEventId: 'raw-click',
    sourceTime: 4,
  };
  project.actionEvents = [
    {
      id: 'click',
      kind: 'CLICK',
      label: 'Click',
      point: { x: 0.1, y: 0.1 },
      data: {},
      capturedDuration: 0.5,
      anchor: factAnchor,
    },
  ];
  project.cursorTrack = createVideoProjectCursorTrack();
  project.cursorTrack.samples = [
    { id: 'cursor', x: 100, y: 100, visible: true, time: 1, sourceAnchor: anchor },
  ];
  const hydrated = hydrateVideoProject(project);
  expect(hydrated.actionEvents[0]).toEqual(project.actionEvents[0]);
  expect(resolveVideoProjectActionOccurrences(hydrated)).toMatchObject([
    { clipId: 'second-instance', time: 9 },
  ]);
  expect(hydrated.cursorTrack?.samples[0]).toMatchObject({ sourceAnchor: anchor, time: 9 });
  expect(isExportReadyVideoProject(hydrated)).toBe(true);
  expect(hydrateVideoProject(hydrated)).toEqual(hydrated);

  const removed = hydrateVideoProject({
    ...project,
    clips: project.clips.filter(({ id }) => id !== 'second-instance'),
  });
  expect(removed.actionEvents[0]?.anchor).toEqual(factAnchor);
  expect(resolveVideoProjectActionOccurrences(removed)).toEqual([]);
  expect(isExportReadyVideoProject(removed)).toBe(false);
  expect(removed.cursorTrack?.samples[0]).not.toHaveProperty('sourceAnchor');
});

function createRecordingInteractionProject() {
  const project = createProject([createVideoClip()]);
  project.source = { kind: VideoProjectSourceKind.RECORDING, recordingId: 'recording-1' };
  project.baseRecordingId = 'recording-1';
  project.assets[0] = {
    ...project.assets[0]!,
    source: { kind: 'recording', recordingId: 'recording-1' },
  };
  return project;
}

it('does not invent anchors for unbound events and preserves explicit project-time ownership', () => {
  const project = createRecordingInteractionProject();
  project.cursorTrack = {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [
      { id: 'cursor-legacy', time: 1, visible: true, x: 1, y: 2 },
      {
        id: 'cursor-manual',
        time: 1.5,
        timeBasis: 'project',
        visible: true,
        x: 3,
        y: 4,
      },
    ],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: false,
    },
  };
  project.actionEvents = [
    {
      id: 'click-manual',
      kind: 'CLICK',
      label: 'Manual click',
      point: null,
      data: {},
      anchor: { kind: 'project', time: 1.5 },
    },
    {
      id: 'callout-manual',
      kind: 'CALLOUT',
      label: 'Manual callout',
      point: null,
      data: {},
      anchor: { kind: 'project', time: 2 },
      presentation: { preset: 'SPOTLIGHT' },
    },
  ];

  const hydrated = hydrateVideoProject(project);
  expect(hydrated.actionEvents).toEqual(project.actionEvents);
  expect(hydrated.cursorTrack?.samples[0]).not.toHaveProperty('sourceAnchor');
  expect(hydrated.cursorTrack?.samples[1]).not.toHaveProperty('sourceAnchor');
});

it('rejects dangling action instances without silently converting facts to manual points', () => {
  const project = createRecordingInteractionProject();
  project.cursorTrack = {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [
      {
        id: 'cursor-dangling',
        sourceAnchor: {
          kind: 'recording-source',
          recordingId: 'foreign-recording',
          sourceClipId: 'missing-clip',
          sourceTime: 1,
        },
        time: 1,
        visible: true,
        x: 1,
        y: 2,
      },
    ],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: false,
    },
  };
  project.actionEvents = [
    {
      id: 'action-dangling',
      kind: 'CLICK',
      label: 'Click',
      point: null,
      data: {},
      anchor: {
        kind: 'recording-source',
        recordingId: 'recording-1',
        sourceInstanceId: 'missing-instance',
        sourceEventId: 'raw',
        sourceTime: 1,
      },
    },
  ];

  const hydrated = hydrateVideoProject(project);

  expect(hydrated.actionEvents).toEqual([expect.objectContaining({ id: 'action-dangling' })]);
  expect(hydrated.actionEvents).toEqual(project.actionEvents);
  expect(isExportReadyVideoProject(hydrated)).toBe(false);
  expect(hydrated.cursorTrack?.samples).toEqual([
    expect.objectContaining({ id: 'cursor-dangling' }),
  ]);
  expect(hydrated.cursorTrack?.samples[0]).not.toHaveProperty('sourceAnchor');
  expect(hydrated.cursorTrack?.samples[0]?.timeBasis).toBe('project');
});
