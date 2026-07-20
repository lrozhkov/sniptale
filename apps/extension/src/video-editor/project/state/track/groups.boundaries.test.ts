import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { getSortedTracks } from '../../../../features/video/project/timeline';
import { VideoTrackKind } from '../../../../features/video/project/types';
import { createProjectTrackStructureActions, createProjectTrackToggleActions } from './groups';
import type { VideoEditorProjectState } from '../contracts';

function createState(): VideoEditorProjectState {
  const project = createEmptyVideoProject('Draft');
  return {
    currentTime: 0,
    project,
    selectedClipId: null,
    selectedTrackId: project.tracks[0]?.id ?? null,
    selection: { kind: 'scene' },
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

  return { getState: () => state, set };
}

it('covers add-track selection and sorted-order move/toggle boundaries', () => {
  const runtime = createMutableState();
  const structure = createProjectTrackStructureActions(runtime.set);
  const toggles = createProjectTrackToggleActions(runtime.set);
  const firstTrackId = getSortedTracks(runtime.getState().project!)[0]!.id;

  structure.addTrack();
  expect(runtime.getState().selection).toEqual({
    kind: 'track',
    trackId: runtime.getState().selectedTrackId,
  });

  structure.moveTrack(firstTrackId, 'up');
  structure.moveTrack('missing', 'down');
  toggles.toggleTrackVisibility('missing');
  toggles.toggleTrackLock('missing');

  expect(runtime.getState().project?.tracks.find((track) => track.id === firstTrackId)?.order).toBe(
    0
  );
  expect(
    runtime.getState().project?.tracks.filter((track) => track.kind === VideoTrackKind.OVERLAY)
      .length
  ).toBeGreaterThan(0);
});

it('moves tracks against normalized visual order rather than raw array position', () => {
  const runtime = createMutableState();
  const structure = createProjectTrackStructureActions(runtime.set);
  const primaryTrackId = runtime
    .getState()
    .project!.tracks.find((track) => track.kind === VideoTrackKind.PRIMARY)!.id;

  structure.moveTrack(primaryTrackId, 'up');

  expect(getSortedTracks(runtime.getState().project!).map((track) => track.kind)).toEqual([
    VideoTrackKind.PRIMARY,
    VideoTrackKind.OVERLAY,
    VideoTrackKind.AUDIO,
  ]);
});

it('protects root tracks while allowing selected extra tracks to fall back to the first remaining track', () => {
  const runtime = createMutableState();
  const structure = createProjectTrackStructureActions(runtime.set);
  const rootOverlayTrackId = runtime
    .getState()
    .project!.tracks.find((track) => track.kind === VideoTrackKind.OVERLAY)!.id;

  structure.addTrack(VideoTrackKind.OVERLAY);
  const extraOverlayTrackId = runtime.getState().project!.tracks.at(-1)!.id;

  structure.deleteTrack(rootOverlayTrackId);
  expect(runtime.getState().project?.tracks.some((track) => track.id === rootOverlayTrackId)).toBe(
    true
  );

  runtime.set({
    selectedTrackId: extraOverlayTrackId,
    selection: { kind: 'track', trackId: extraOverlayTrackId },
  });
  structure.deleteTrack(extraOverlayTrackId);

  expect(runtime.getState().project?.tracks.some((track) => track.id === extraOverlayTrackId)).toBe(
    false
  );
  expect(runtime.getState().selection).toEqual({
    kind: 'track',
    trackId: runtime.getState().project!.tracks[0]!.id,
  });
});
