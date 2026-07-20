import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { createSelectionStateActions, resolveInitialSelectedClipId } from './selection-actions';
import type { VideoEditorState } from './types';

function createSelectionStore(project = createEmptyVideoProject('Selection')) {
  let state = {
    currentTime: 0,
    diagnosticsOpen: false,
    error: null,
    exportState: {
      dialogOpen: false,
      error: null,
      isRunning: false,
      jobId: null,
      lastResult: null,
      settings: null,
      status: null,
    },
    isPlaying: false,
    isReady: true,
    placementMode: null,
    pixelsPerSecond: 90,
    project,
    recordingId: null,
    saveState: 'idle',
    selectedClipId: null,
    selectedTrackId: null,
    selection: { kind: 'scene' },
  } as VideoEditorState;

  const set = (
    partial: Partial<VideoEditorState> | ((value: VideoEditorState) => Partial<VideoEditorState>)
  ) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...nextState };
  };

  return {
    actions: createSelectionStateActions(set as never),
    getState: () => state,
  };
}

it('prefers the first non-audio clip when resolving the initial selected clip id', () => {
  const project = createEmptyVideoProject('Selection');
  const trackId = project.tracks[0]!.id;
  project.clips = [
    createClip(trackId, 'clip-audio', 'AUDIO'),
    createClip(trackId, 'clip-video', 'VIDEO'),
  ] as never;

  expect(resolveInitialSelectedClipId(project)).toBe('clip-video');
});

it('falls back to the first clip or null when no non-audio clip exists', () => {
  const project = createEmptyVideoProject('Selection');
  const trackId = project.tracks[0]!.id;
  project.clips = [createClip(trackId, 'clip-audio', 'AUDIO')] as never;

  expect(resolveInitialSelectedClipId(project)).toBe('clip-audio');
  project.clips = [] as never;
  expect(resolveInitialSelectedClipId(project)).toBeNull();
});

it('resets selection and placement when track or clip selection is cleared', () => {
  const store = createSelectionStore();
  const trackId = store.getState().project!.tracks[0]!.id;

  store.actions.startActionPointPlacement('action-1');
  store.actions.selectTrack(null);
  expect(store.getState()).toMatchObject({
    placementMode: null,
    selectedTrackId: null,
    selection: { kind: 'scene' },
  });

  store.getState().project!.clips = [createClip(trackId, 'clip-video', 'VIDEO')] as never;
  store.actions.selectClip('clip-video');
  store.actions.selectClip(null);
  expect(store.getState().selection).toEqual({ kind: 'scene' });
});

it('resolves transition ownership from the leading or trailing clip track', () => {
  const project = createEmptyVideoProject('Selection');
  const [trackA] = project.tracks;
  project.tracks.push({ id: 'track-2', kind: 'VIDEO', name: 'Track 2' } as never);
  project.clips = [
    createClip(trackA!.id, 'clip-a', 'VIDEO'),
    createClip('track-2', 'clip-b', 'VIDEO'),
  ] as never;
  project.transitions = [
    {
      duration: 0.6,
      easing: 'LINEAR',
      id: 'transition-1',
      kind: 'CROSSFADE',
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
    },
    {
      duration: 0.6,
      easing: 'LINEAR',
      id: 'transition-2',
      kind: 'CROSSFADE',
      leadingClipId: 'missing',
      trailingClipId: 'clip-b',
    },
  ] as never;

  const store = createSelectionStore(project);
  store.actions.selectTransition('transition-1');
  expect(store.getState().selectedTrackId).toBe(trackA!.id);
  store.actions.selectTransition('transition-2');
  expect(store.getState().selectedTrackId).toBe('track-2');
});

it('supports direct playing and placement reset actions', () => {
  const store = createSelectionStore();
  store.actions.startMotionFocusPlacement('motion-1');
  store.actions.setPlaying(true);
  store.actions.clearPlacementMode();

  expect(store.getState()).toMatchObject({
    isPlaying: true,
    placementMode: null,
  });
});

function createClip(trackId: string, id: string, type: 'AUDIO' | 'VIDEO') {
  return {
    assetId: `${id}-asset`,
    duration: 3,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: 'CONTAIN',
    groupId: null,
    id,
    linkMode: 'DETACHED',
    muted: false,
    name: id,
    sourceDuration: 3,
    sourceStart: 0,
    startTime: 0,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    type,
    volume: 1,
  };
}
