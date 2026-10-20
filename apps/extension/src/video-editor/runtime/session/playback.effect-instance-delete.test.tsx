// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectFromRecording,
} from '../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { PlaybackHandlers, PlaybackLatestState } from '../../interaction/playback/types';
import { useVideoEditorStore } from '../../state/store';
import { usePlaybackShortcuts } from './playback/shortcuts';

it('deletes the selected effect instance through the playback shortcut', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const deleteEffectInstance = vi.fn();
  const handlers = {
    clearPlacementMode: vi.fn(),
    deleteActionEvent: vi.fn(),
    deleteClip: vi.fn(),
    deleteCursorSample: vi.fn(),
    editCommentDocument: vi.fn(),
    deleteEffectInstance,
    deleteMotionRegion: vi.fn(),
    deleteObjectTrack: vi.fn(),
    duplicateClip: vi.fn(),
    setCurrentTime: vi.fn(),
    setPlaying: vi.fn(),
    splitClipAt: vi.fn(),
    updateActionEventDetails: vi.fn(),
    updateClipTransform: vi.fn(),
    updateMotionRegion: vi.fn(),
  } satisfies PlaybackHandlers;
  const state = {
    currentTime: 0,
    isPlaying: false,
    placementMode: null,
    playbackRange: null,
    project: createEmptyVideoProject('Effect shortcut'),
    projectHistoryTransactionActive: false,
    selectedActionOccurrence: null,
    selectedClipId: null,
    selectedMotionRegion: null,
    selection: {
      kind: VideoEditorSelectionKind.EFFECT_INSTANCE,
      effectInstanceId: 'effect-instance',
    },
  } satisfies PlaybackLatestState;

  function Harness() {
    usePlaybackShortcuts({ current: state }, { current: handlers }, vi.fn(), vi.fn(), vi.fn());
    return null;
  }

  try {
    act(() => root.render(<Harness />));
    await act(async () => undefined);
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Delete' })
      );
    });
    expect(deleteEffectInstance).toHaveBeenCalledWith('effect-instance');
  } finally {
    act(() => root.unmount());
  }
});

it('deletes only the selected note, preserves typing and foreign transactions, and supports Undo', () => {
  const initial = useVideoEditorStore.getState();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const project = createVideoProjectFromRecording({
    recordingId: 'notes',
    filename: 'video.webm',
    width: 640,
    height: 360,
    duration: 12,
    mimeType: 'video/webm',
    size: 100,
  });
  project.version = 23;
  project.commentDocuments = [
    {
      id: 'doc',
      binding: { kind: 'project' },
      annotations: [{ id: 'note', text: 'Keep editable', anchor: { kind: 'point', time: 2 } }],
      canvasComments: [],
    },
  ];
  useVideoEditorStore.getState().setProject(project);
  useVideoEditorStore.getState().selectComment('doc', 'note');
  const acceptedClips = structuredClone(useVideoEditorStore.getState().project!.clips);
  function Harness() {
    const state = useVideoEditorStore();
    const latest: PlaybackLatestState = {
      currentTime: state.currentTime,
      isPlaying: state.isPlaying,
      placementMode: null,
      playbackRange: null,
      project: state.project,
      projectHistoryTransactionActive: state.projectHistory.transaction !== null,
      selection: state.selection,
      selectedActionOccurrence: null,
      selectedClipId: null,
      selectedMotionRegion: null,
    };
    usePlaybackShortcuts({ current: latest }, { current: state }, vi.fn(), vi.fn(), vi.fn());
    return <textarea aria-label="Note text" defaultValue="Keep editable" />;
  }
  const pressDelete = (target: HTMLElement) =>
    act(() =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Delete', bubbles: true, cancelable: true })
      )
    );
  try {
    act(() => root.render(<Harness />));
    pressDelete(container.querySelector('textarea')!);
    expect(useVideoEditorStore.getState().project!.commentDocuments![0]!.annotations).toHaveLength(
      1
    );
    let lease: ReturnType<typeof initial.beginProjectHistoryTransaction>;
    act(() => {
      lease = useVideoEditorStore.getState().beginProjectHistoryTransaction();
    });
    pressDelete(document.body);
    expect(useVideoEditorStore.getState().project!.commentDocuments![0]!.annotations).toHaveLength(
      1
    );
    expect(useVideoEditorStore.getState().isProjectHistoryTransactionCurrent(lease!)).toBe(true);
    act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease!));
    pressDelete(document.body);
    expect(useVideoEditorStore.getState().project!.commentDocuments![0]!.annotations).toHaveLength(
      0
    );
    expect(useVideoEditorStore.getState().project!.clips).toEqual(acceptedClips);
    expect(useVideoEditorStore.getState().selection.kind).toBe('scene');
    act(() => useVideoEditorStore.getState().undoProject());
    expect(useVideoEditorStore.getState().project!.commentDocuments![0]!.annotations[0]!.text).toBe(
      'Keep editable'
    );
  } finally {
    act(() => root.unmount());
    container.remove();
    useVideoEditorStore.setState(initial, true);
  }
});
