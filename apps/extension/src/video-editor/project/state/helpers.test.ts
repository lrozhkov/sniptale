import { describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { VideoEditorProjectState } from './contracts';
import {
  createActionPointPlacementMode,
  createMotionFocusPlacementMode,
} from '../selection/placement';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoMotionFocusMode,
  VideoProjectClipType,
  VideoTrackKind,
  type VideoProject,
} from '../../../features/video/project/types';
import {
  applyProjectUpdate,
  areClipTracksEditable,
  detachLinkedClips,
  ensureTrackForKind,
  getClipOperationIds,
  resolveEditableClipOperation,
  updateSourceTimedClipTiming,
} from './helpers';

function createLinkedProject(): VideoProject {
  const project = createEmptyVideoProject('Helpers');
  const [primaryTrack, audioTrack] = project.tracks;
  project.clips = [
    {
      id: 'video-1',
      trackId: primaryTrack!.id,
      type: VideoProjectClipType.VIDEO,
      name: 'Video 1',
      groupId: 'group-1',
      linkMode: VideoClipLinkMode.LINKED,
      startTime: 0,
      duration: 4,
      muted: false,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      transitionIn: VideoClipTransitionKind.NONE,
      transitionOut: VideoClipTransitionKind.NONE,
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
      assetId: 'asset-1',
      fitMode: VideoMediaFitMode.CONTAIN,
      sourceStart: 0,
      sourceDuration: 4,
    },
    {
      id: 'audio-1',
      trackId: audioTrack!.id,
      type: VideoProjectClipType.AUDIO,
      name: 'Audio 1',
      groupId: 'group-1',
      linkMode: VideoClipLinkMode.LINKED,
      startTime: 0,
      duration: 4,
      muted: false,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      transitionIn: VideoClipTransitionKind.NONE,
      transitionOut: VideoClipTransitionKind.NONE,
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
      assetId: 'asset-1',
      sourceStart: 0,
      sourceDuration: 4,
    },
  ];
  return project;
}

describe('video editor project helpers', () => {
  it(
    'reuses preferred or existing tracks and creates missing tracks when needed',
    verifyEnsureTrackForKind
  );
  it(
    'tracks linked clip ids, editability, detachment, and selection cleanup',
    verifyProjectHelperGuards
  );
});

function verifyEnsureTrackForKind(): void {
  vi.spyOn(Date, 'now').mockReturnValue(100);
  const project = createEmptyVideoProject('Helpers');

  expect(ensureTrackForKind(project, VideoTrackKind.PRIMARY, project.tracks[0]!.id)).toEqual({
    project,
    trackId: project.tracks[0]!.id,
  });
  expect(ensureTrackForKind(project, VideoTrackKind.AUDIO, null)).toEqual({
    project,
    trackId: project.tracks[1]!.id,
  });

  const withoutOverlay = { ...project, tracks: project.tracks.slice(0, 2) };
  const created = ensureTrackForKind(withoutOverlay, VideoTrackKind.OVERLAY, null);
  expect(created.project.tracks).toHaveLength(3);
  expect(created.project.updatedAt).toBe(100);
}

function verifyProjectHelperGuards(): void {
  vi.spyOn(Date, 'now').mockReturnValue(200);
  const project = createLinkedProject();

  expectEditableOperation(project);
  expectUpdatedSourceTimedClip(project);
  expectLockedDetachmentGuard(project);

  const detachedProject = detachLinkedClips(project, 'video-1');
  expect(detachedProject.clips.every((clip) => clip.linkMode === VideoClipLinkMode.DETACHED)).toBe(
    true
  );

  const nextState = applyProjectUpdate(
    {
      currentTime: 5,
      project,
      selection: { kind: 'clip', clipId: 'video-1' },
      selectedClipId: 'video-1',
      selectedTrackId: project.tracks[0]!.id,
    } as VideoEditorProjectState,
    () => ({
      ...project,
      clips: [],
      tracks: [project.tracks[1]!],
    })
  );
  expect(nextState.selectedClipId).toBeNull();
  expect(nextState.selectedTrackId).toBe(project.tracks[1]!.id);
  expectMotionSelectionCleanup(project);
  expectMotionPlacementModeCleanupOnFocusModeChange(project);
  expectActionPlacementPreserved(project);
}

function expectEditableOperation(project: VideoProject): void {
  expect(getClipOperationIds(project, 'video-1')).toEqual(['video-1', 'audio-1']);
  expect(areClipTracksEditable(project, ['video-1', 'audio-1'])).toBe(true);
  expect(resolveEditableClipOperation(project, 'video-1')).toEqual(
    expect.objectContaining({
      clip: expect.objectContaining({ id: 'video-1' }),
      clipIds: ['video-1', 'audio-1'],
      affectedClips: [
        expect.objectContaining({ id: 'video-1' }),
        expect.objectContaining({ id: 'audio-1' }),
      ],
    })
  );
  expect(resolveEditableClipOperation(project, 'missing')).toBeNull();
}

function expectUpdatedSourceTimedClip(project: VideoProject): void {
  const videoClip = project.clips.find((clip) => clip.id === 'video-1');
  if (!videoClip || videoClip.type !== VideoProjectClipType.VIDEO) {
    throw new Error('Expected linked video clip');
  }

  expect(updateSourceTimedClipTiming(videoClip, { playbackRate: 2 })).toEqual(
    expect.objectContaining({
      duration: 2,
      playbackRate: 2,
      sourceDuration: 4,
    })
  );
  expect(updateSourceTimedClipTiming(videoClip, { playbackRate: 0 })).toEqual(
    expect.objectContaining({
      duration: 4,
      playbackRate: 1,
      sourceDuration: 4,
    })
  );
}

function expectLockedDetachmentGuard(project: VideoProject): void {
  const lockedProject = {
    ...project,
    tracks: project.tracks.map((track) =>
      track.id === project.tracks[0]!.id ? { ...track, locked: true } : track
    ),
  };
  expect(areClipTracksEditable(lockedProject, ['video-1'])).toBe(false);
  expect(detachLinkedClips(lockedProject, 'video-1')).toBe(lockedProject);
}

function expectMotionSelectionCleanup(project: VideoProject): void {
  const motionProject = {
    ...project,
    motionRegions: [
      {
        duration: 1,
        easing: 'LINEAR',
        focusMode: 'MANUAL',
        focusPoint: { x: 10, y: 20 },
        id: 'motion-1',
        scale: 1.2,
        startTime: 0,
        targetActionEventId: null,
        zoomInDuration: 0.2,
        zoomOutDuration: 0.2,
      },
    ],
  } as VideoEditorProjectState['project'];
  const motionState = applyProjectUpdate(
    {
      currentTime: 1,
      placementMode: createMotionFocusPlacementMode('motion-1'),
      project: motionProject,
      selection: { kind: 'motion-region', motionRegionId: 'motion-1' },
      selectedClipId: null,
      selectedTrackId: project.tracks[0]!.id,
    } as VideoEditorProjectState,
    (currentProject) => ({
      ...currentProject,
      motionRegions: [],
    })
  );

  expect(motionState.selection).toEqual({ kind: 'scene' });
  expect(motionState.placementMode).toBeNull();
}

function expectActionPlacementPreserved(project: VideoProject): void {
  const actionProject = {
    ...project,
    actionEvents: [
      {
        data: {},
        duration: 0.2,
        id: 'action-1',
        kind: 'CLICK',
        label: 'Action',
        point: { x: 10, y: 20 },
        preset: 'CLICK_RIPPLE',
        time: 0.1,
      },
    ],
  } as VideoEditorProjectState['project'];
  const actionState = applyProjectUpdate(
    {
      currentTime: 1,
      placementMode: createActionPointPlacementMode('action-1'),
      project: actionProject,
      selection: { kind: 'action-segment', actionEventId: 'action-1' },
      selectedClipId: null,
      selectedTrackId: project.tracks[0]!.id,
    } as VideoEditorProjectState,
    (currentProject) => ({
      ...currentProject,
      name: 'Helpers updated',
    })
  );

  expect(actionState.placementMode).toEqual(createActionPointPlacementMode('action-1'));
}

function expectMotionPlacementModeCleanupOnFocusModeChange(project: VideoProject): void {
  const motionProject = {
    ...project,
    motionRegions: [
      {
        duration: 1,
        easing: 'LINEAR',
        focusMode: VideoMotionFocusMode.MANUAL,
        focusPoint: { x: 10, y: 20 },
        id: 'motion-1',
        scale: 1.2,
        startTime: 0,
        targetActionEventId: null,
        zoomInDuration: 0.2,
        zoomOutDuration: 0.2,
      },
    ],
  } as VideoEditorProjectState['project'];
  const nextState = applyProjectUpdate(
    {
      currentTime: 1,
      placementMode: createMotionFocusPlacementMode('motion-1'),
      project: motionProject,
      selection: { kind: 'motion-region', motionRegionId: 'motion-1' },
      selectedClipId: null,
      selectedTrackId: project.tracks[0]!.id,
    } as VideoEditorProjectState,
    (currentProject) => ({
      ...currentProject,
      motionRegions: (currentProject.motionRegions ?? []).map((region) => ({
        ...region,
        focusMode: VideoMotionFocusMode.CURSOR,
      })),
    })
  );

  expect(nextState.selection).toEqual({ kind: 'motion-region', motionRegionId: 'motion-1' });
  expect(nextState.placementMode).toBeNull();
}
