import { expect, it } from 'vitest';
import { createProject, createVideoClip } from '../timeline/project-meta.test.helpers.ts';
import { VideoCursorCaptureMode, VideoProjectSourceKind } from '../types/index';
import { hydrateVideoProject } from './index';

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

it('infers only unclassified legacy interactions and preserves explicit project-time ownership', () => {
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
      data: {},
      duration: 0,
      id: 'click-legacy',
      kind: 'CLICK',
      label: 'Legacy click',
      point: null,
      preset: 'CLICK_RIPPLE',
      time: 1,
    },
    {
      data: {},
      duration: 0,
      id: 'click-manual',
      kind: 'CLICK',
      label: 'Manual click',
      point: null,
      preset: 'CLICK_RIPPLE',
      time: 1.5,
      timeBasis: 'project',
    },
    {
      data: {},
      duration: 1,
      id: 'callout-manual',
      kind: 'CALLOUT',
      label: 'Manual callout',
      point: null,
      preset: 'SPOTLIGHT',
      time: 2,
    },
  ];

  const runtimeHydrated = hydrateVideoProject(project);
  expect(runtimeHydrated.actionEvents[0]).not.toHaveProperty('sourceAnchor');

  const hydrated = hydrateVideoProject(project, { inferLegacyInteractionAnchors: true });
  expect(hydrated.actionEvents[0]?.sourceAnchor).toEqual(
    expect.objectContaining({ recordingId: 'recording-1', sourceTime: 1 })
  );
  expect(hydrated.cursorTrack?.samples[0]?.sourceAnchor).toEqual(
    expect.objectContaining({ recordingId: 'recording-1', sourceTime: 1 })
  );
  expect(hydrated.actionEvents[1]).toEqual(
    expect.objectContaining({ id: 'click-manual', timeBasis: 'project' })
  );
  expect(hydrated.actionEvents[1]).not.toHaveProperty('sourceAnchor');
  expect(hydrated.actionEvents[2]?.timeBasis).toBe('project');
  expect(hydrated.cursorTrack?.samples[1]).not.toHaveProperty('sourceAnchor');
});

it('strips dangling explicit source anchors without dropping their interactions', () => {
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
      data: {},
      duration: 0,
      id: 'action-dangling',
      kind: 'CLICK',
      label: 'Click',
      point: null,
      preset: 'CLICK_RIPPLE',
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: 'recording-1',
        sourceClipId: 'missing-clip',
        sourceTime: 1,
      },
      time: 1,
    },
  ];

  const hydrated = hydrateVideoProject(project, { inferLegacyInteractionAnchors: true });

  expect(hydrated.actionEvents).toEqual([expect.objectContaining({ id: 'action-dangling' })]);
  expect(hydrated.actionEvents[0]).not.toHaveProperty('sourceAnchor');
  expect(hydrated.actionEvents[0]?.timeBasis).toBe('project');
  expect(hydrated.cursorTrack?.samples).toEqual([
    expect.objectContaining({ id: 'cursor-dangling' }),
  ]);
  expect(hydrated.cursorTrack?.samples[0]).not.toHaveProperty('sourceAnchor');
  expect(hydrated.cursorTrack?.samples[0]?.timeBasis).toBe('project');
});
