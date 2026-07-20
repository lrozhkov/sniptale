import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { VideoProjectAssetType, VideoTrackKind } from '../../../../features/video/project/types';
import { createProjectTrackStructureActions, createProjectTrackToggleActions } from './groups';
import type { VideoEditorProjectState } from '../contracts';

function createState(): VideoEditorProjectState {
  const project = createEmptyVideoProject('Draft');

  return {
    currentTime: 0,
    project,
    selection: { kind: 'scene' },
    selectedClipId: null,
    selectedTrackId: project.tracks[0]?.id ?? null,
  } as VideoEditorProjectState;
}

function createMutableState() {
  let state = createState();
  const set = (
    updater:
      | Partial<VideoEditorProjectState>
      | ((state: VideoEditorProjectState) => Partial<VideoEditorProjectState>)
  ) => {
    const nextPatch = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...nextPatch };
  };

  return {
    getState: () => state,
    replaceState: (nextState: VideoEditorProjectState) => {
      state = nextState;
    },
    set,
  };
}

describe('video editor project track groups', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(500);
  });

  it(
    'applies rename, add, reorder, and toggle actions through the project update seam',
    verifyTrackGroupMutations
  );
  it(
    'deletes only extra tracks and clears clip selection when the removed track owned it',
    verifyTrackDeleteSelectionCleanup
  );
  it(
    'prunes orphaned assets when deleting a removable track with clip-backed media',
    verifyTrackDeleteAssetPrune
  );
});

function verifyTrackGroupMutations() {
  const runtime = createMutableState();
  const structure = createProjectTrackStructureActions(runtime.set);
  const toggles = createProjectTrackToggleActions(runtime.set);
  const primaryTrackId = runtime.getState().project!.tracks[0]!.id;

  structure.renameProject('Edited');
  structure.renameTrack(primaryTrackId, 'Primary renamed');
  structure.addTrackLogicalLane(primaryTrackId);
  structure.addTrack(VideoTrackKind.SUBTITLE);
  const subtitleTrackId = runtime.getState().project!.tracks.at(-1)!.id;
  structure.updateSubtitleTrackStyle(subtitleTrackId, { safeAreaPercent: 12 });
  structure.addTrack(VideoTrackKind.AUDIO);
  structure.moveTrack(primaryTrackId, 'down');
  toggles.toggleTrackVisibility(primaryTrackId);
  toggles.toggleTrackLock(primaryTrackId);

  const nextProject = runtime.getState().project!;
  const primaryTrack = nextProject.tracks.find((track) => track.id === primaryTrackId);
  const subtitleTrack = nextProject.tracks.find((track) => track.id === subtitleTrackId);

  expect(nextProject.name).toBe('Edited');
  expect(nextProject.tracks).toHaveLength(5);
  expect(nextProject.tracks[0]?.isRoot).toBe(true);
  expect(primaryTrack).toEqual(
    expect.objectContaining({
      locked: true,
      name: 'Primary renamed',
      visible: false,
      logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
    })
  );
  expect(subtitleTrack).toEqual(
    expect.objectContaining({
      kind: VideoTrackKind.SUBTITLE,
      subtitleStyle: expect.objectContaining({ safeAreaPercent: 12 }),
    })
  );
  expect(nextProject.updatedAt).toBe(500);
}

function buildOverlaySelectionState(
  state: VideoEditorProjectState,
  overlayTrackId: string,
  clipId: string
) {
  return {
    ...state,
    project: {
      ...state.project!,
      clips: [
        {
          id: clipId,
          trackId: overlayTrackId,
          type: 'TEXT',
          name: 'Overlay',
          groupId: null,
          linkMode: 'DETACHED',
          startTime: 0,
          duration: 2,
          muted: false,
          volume: 1,
          fadeInMs: 0,
          fadeOutMs: 0,
          transitionIn: 'NONE',
          transitionOut: 'NONE',
          transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
          text: 'Overlay',
          style: {
            fontSize: 24,
            fontFamily: 'Arial',
            fontWeight: 400,
            fontStyle: 'normal',
            textAlign: 'left',
            color: '#ffffff',
            backgroundColor: 'transparent',
          },
        } as never,
      ],
    },
    selectedClipId: clipId,
    selection: { kind: 'clip', clipId },
  } as VideoEditorProjectState;
}

function verifyTrackDeleteSelectionCleanup() {
  const runtime = createMutableState();
  const clipId = 'overlay-clip';
  const structure = createProjectTrackStructureActions(runtime.set);

  const rootPrimaryTrackId = runtime.getState().project!.tracks[0]!.id;
  structure.deleteTrack(rootPrimaryTrackId);
  expect(runtime.getState().project?.tracks).toHaveLength(3);
  expect(runtime.getState().project?.tracks.some((track) => track.id === rootPrimaryTrackId)).toBe(
    true
  );

  structure.addTrack(VideoTrackKind.OVERLAY);
  const extraOverlayTrackId = runtime.getState().project!.tracks.at(-1)!.id;
  runtime.replaceState(buildOverlaySelectionState(runtime.getState(), extraOverlayTrackId, clipId));
  structure.deleteTrack(extraOverlayTrackId);

  expect(runtime.getState().project?.tracks.some((track) => track.id === extraOverlayTrackId)).toBe(
    false
  );
  expect(runtime.getState().selectedClipId).toBeNull();
  expect(runtime.getState().selection).toEqual({ kind: 'scene' });
}

function createOverlayAsset() {
  return createVideoProjectAsset(
    'overlay-image',
    VideoProjectAssetType.IMAGE,
    {
      kind: 'project-asset',
      projectAssetId: 'overlay-asset',
    },
    {
      width: 800,
      height: 600,
      duration: null,
      mimeType: 'image/png',
      size: 42,
      hasAudio: false,
      audioPeaks: null,
    }
  );
}

function seedRemovableOverlayTrack(runtime: ReturnType<typeof createMutableState>) {
  const structure = createProjectTrackStructureActions(runtime.set);
  structure.addTrack(VideoTrackKind.OVERLAY);
  const removableTrackId = runtime.getState().project!.tracks.at(-1)!.id;
  const extraAsset = createOverlayAsset();

  runtime.replaceState({
    ...runtime.getState(),
    project: {
      ...runtime.getState().project!,
      assets: [extraAsset],
      clips: [
        {
          id: 'clip-1',
          trackId: removableTrackId,
          type: 'IMAGE',
          name: 'Overlay image',
          groupId: null,
          linkMode: 'DETACHED',
          startTime: 1,
          duration: 3,
          muted: false,
          volume: 1,
          fadeInMs: 0,
          fadeOutMs: 0,
          transitionIn: 'NONE',
          transitionOut: 'NONE',
          transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
          assetId: extraAsset.id,
          fitMode: 'CONTAIN',
        } as never,
      ],
    },
  });

  return { removableTrackId, structure };
}

function verifyTrackDeleteAssetPrune() {
  const runtime = createMutableState();
  const { removableTrackId, structure } = seedRemovableOverlayTrack(runtime);
  structure.deleteTrack(removableTrackId);

  expect(runtime.getState().project?.tracks.some((track) => track.id === removableTrackId)).toBe(
    false
  );
  expect(runtime.getState().project?.assets).toEqual([]);
}
