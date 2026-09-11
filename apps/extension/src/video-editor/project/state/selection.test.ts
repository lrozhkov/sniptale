import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  resolveSelectedTrackIdFromSelection,
  resolveSelectionAfterProjectUpdate,
} from './selection';

function createSelectionProject() {
  const project = createEmptyVideoProject('Selection');
  const [primaryTrack] = project.tracks;

  project.clips = [createSelectionClip(primaryTrack!.id)];
  project.transitions = [createSelectionTransition()];
  project.cursorTrack = createSelectionCursorTrack();
  project.objectTracks = [
    {
      id: 'visual-cursor',
      kind: 'visualCursor',
      samples: [{ confidence: 1, time: 0.2, visible: true, x: 10, y: 20 }],
      source: 'visualDetection',
    },
  ];
  project.actionEvents = [createSelectionActionEvent()];
  project.motionRegions = [createSelectionMotionRegion()];

  return project;
}

function createSelectionClip(trackId: string) {
  return {
    assetId: 'asset-a',
    duration: 3,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: 'CONTAIN',
    groupId: null,
    id: 'clip-1',
    linkMode: 'DETACHED',
    muted: false,
    name: 'Clip',
    startTime: 0,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    type: 'IMAGE',
    volume: 1,
  } as never;
}

function createSelectionTransition() {
  return {
    duration: 0.5,
    easing: 'LINEAR',
    id: 'transition-1',
    kind: 'CROSSFADE',
    leadingClipId: 'clip-1',
    trailingClipId: 'clip-1',
  } as never;
}

function createSelectionCursorTrack() {
  return {
    captureMode: 'SEPARATE',
    samples: [{ id: 'cursor-1', time: 0.2, visible: true, x: 10, y: 20 }],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: true,
    },
  } as never;
}

function createSelectionActionEvent() {
  return {
    data: {},
    capturedDuration: 0.2,
    id: 'action-1',
    kind: 'CLICK',
    label: 'Click',
    point: { x: 10, y: 20 },
    presentation: { preset: 'CLICK_RIPPLE' },
    anchor: { kind: 'project' as const, time: 0.2 },
  } as never;
}

function createSelectionMotionRegion() {
  return {
    duration: 1,
    easing: 'LINEAR',
    focusMode: 'MANUAL',
    focusPoint: { x: 10, y: 20 },
    id: 'motion-1',
    scale: 1.2,
    startTime: 0,
    targetAction: null,
    zoomInDuration: 0.1,
    zoomOutDuration: 0.1,
  } as never;
}

it('keeps or clears each selection kind according to current project ownership', () => {
  const project = createSelectionProject();

  expect(resolveSelectionAfterProjectUpdate(project, { kind: 'scene' })).toEqual({
    kind: 'scene',
  });
  expect(resolveSelectionAfterProjectUpdate(project, { clipId: 'clip-1', kind: 'clip' })).toEqual({
    clipId: 'clip-1',
    kind: 'clip',
  });
  expect(
    resolveSelectionAfterProjectUpdate(project, { kind: 'track', trackId: project.tracks[0]!.id })
  ).toEqual({ kind: 'track', trackId: project.tracks[0]!.id });
  expect(
    resolveSelectionAfterProjectUpdate(project, {
      kind: 'transition-junction',
      transitionId: 'transition-1',
    })
  ).toEqual({ kind: 'transition-junction', transitionId: 'transition-1' });
  expect(
    resolveSelectionAfterProjectUpdate(project, { kind: 'cursor-segment', sampleId: 'cursor-1' })
  ).toEqual({ kind: 'cursor-segment', sampleId: 'cursor-1' });
  expect(
    resolveSelectionAfterProjectUpdate(project, {
      kind: 'object-track',
      objectTrackId: 'visual-cursor',
    })
  ).toEqual({ kind: 'object-track', objectTrackId: 'visual-cursor' });
  expect(
    resolveSelectionAfterProjectUpdate(project, {
      eventId: 'action-1',
      clipId: null,
      kind: 'action-occurrence',
    })
  ).toEqual({ eventId: 'action-1', clipId: null, kind: 'action-occurrence' });
  expect(
    resolveSelectionAfterProjectUpdate(project, {
      kind: 'motion-region',
      motionRegionId: 'motion-1',
    })
  ).toEqual({ kind: 'motion-region', motionRegionId: 'motion-1' });
  expect(resolveSelectionAfterProjectUpdate(project, { clipId: 'missing', kind: 'clip' })).toEqual({
    kind: 'scene',
  });
  expect(
    resolveSelectionAfterProjectUpdate(project, {
      kind: 'object-track',
      objectTrackId: 'missing',
    })
  ).toEqual({ kind: 'scene' });
});

it('keeps utility lane selections when their project lane is hidden', () => {
  const project = createSelectionProject();
  project.utilityLanes = {
    actions: { visible: false, locked: false },
    camera: { visible: false, locked: false },
  };

  expect(
    resolveSelectionAfterProjectUpdate(project, {
      eventId: 'action-1',
      clipId: null,
      kind: 'action-occurrence',
    })
  ).toEqual({ eventId: 'action-1', clipId: null, kind: 'action-occurrence' });
  expect(
    resolveSelectionAfterProjectUpdate(project, {
      kind: 'motion-region',
      motionRegionId: 'motion-1',
    })
  ).toEqual({ kind: 'motion-region', motionRegionId: 'motion-1' });
});

it('resolves selected tracks from clip and transition selections and clears non-track-owned selections', () => {
  const project = createSelectionProject();
  const trackId = project.tracks[0]!.id;

  expect(resolveSelectedTrackIdFromSelection(project, { clipId: 'clip-1', kind: 'clip' })).toBe(
    trackId
  );
  expect(
    resolveSelectedTrackIdFromSelection(project, {
      kind: 'transition-junction',
      transitionId: 'transition-1',
    })
  ).toBe(trackId);
  expect(resolveSelectedTrackIdFromSelection(project, { kind: 'track', trackId })).toBe(trackId);
  expect(resolveSelectedTrackIdFromSelection(project, { kind: 'scene' })).toBeNull();
  expect(
    resolveSelectedTrackIdFromSelection(project, {
      eventId: 'action-1',
      clipId: null,
      kind: 'action-occurrence',
    })
  ).toBeNull();
  expect(
    resolveSelectedTrackIdFromSelection(project, { kind: 'cursor-segment', sampleId: 'cursor-1' })
  ).toBeNull();
  expect(
    resolveSelectedTrackIdFromSelection(project, {
      kind: 'object-track',
      objectTrackId: 'visual-cursor',
    })
  ).toBeNull();
  expect(
    resolveSelectedTrackIdFromSelection(project, {
      kind: 'motion-region',
      motionRegionId: 'motion-1',
    })
  ).toBeNull();
});

it('keeps Zoom lane selection across updates and clears it when the last region disappears', () => {
  const project = createSelectionProject();
  const selection = { kind: 'motion-lane' } as const;
  expect(resolveSelectionAfterProjectUpdate(project, selection)).toBe(selection);
  expect(resolveSelectedTrackIdFromSelection(project, selection)).toBeNull();
  project.motionRegions = [];
  expect(resolveSelectionAfterProjectUpdate(project, selection)).toEqual({ kind: 'scene' });
});

it('clears orphaned FX targets and reconciles groups after removing their clips', () => {
  const project = createSelectionProject();
  project.effectInstances = [
    {
      id: 'fx',
      kind: 'targetEffect',
      target: { kind: 'clip', clipId: 'missing' },
      controls: {},
      enabled: true,
      duration: 1,
      startTime: 0,
      playbackRate: 1,
      snapshotId: 'snapshot',
    },
  ];
  const selected = { kind: 'effect-instance', effectInstanceId: 'fx' } as const;
  expect(resolveSelectedTrackIdFromSelection(project, selected)).toBeNull();
  expect(resolveSelectionAfterProjectUpdate(project, selected)).toEqual(selected);
  project.effectInstances = [];
  expect(resolveSelectionAfterProjectUpdate(project, selected)).toEqual({ kind: 'scene' });
  const group = {
    kind: 'clip-group',
    clipIds: ['clip-1', 'clip-2', 'missing'],
    anchorClipId: 'missing',
  } as const;
  project.clips.push({ ...project.clips[0]!, id: 'clip-2' });
  const mutableGroup = { ...group, clipIds: [...group.clipIds] };
  const retained = resolveSelectionAfterProjectUpdate(project, mutableGroup);
  expect(retained).toEqual({
    kind: 'clip-group',
    clipIds: ['clip-1', 'clip-2'],
    anchorClipId: 'clip-1',
  });
  expect(resolveSelectionAfterProjectUpdate(project, retained)).toEqual(retained);
  project.clips.pop();
  expect(resolveSelectionAfterProjectUpdate(project, mutableGroup)).toEqual({
    kind: 'clip',
    clipId: 'clip-1',
  });
  project.clips = [];
  expect(resolveSelectionAfterProjectUpdate(project, mutableGroup)).toEqual({ kind: 'scene' });
  expect(
    resolveSelectedTrackIdFromSelection(project, {
      kind: 'transition-junction',
      transitionId: 'missing',
    })
  ).toBeNull();
  expect(
    resolveSelectedTrackIdFromSelection(project, {
      kind: 'transition-junction',
      transitionId: 'transition-1',
    })
  ).toBeNull();
});
