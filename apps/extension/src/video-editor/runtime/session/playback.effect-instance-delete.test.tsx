// @vitest-environment jsdom
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
import { anchorReviewVoiceoverAtSource } from '../../../features/video/review/voiceover-edits';
import { isExportReadyVideoProject } from '../../../features/video/project/validation/root';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
  createVideoProjectAsset,
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
    deleteSourceVoiceover: vi.fn(),
    duplicateSourceVoiceover: vi.fn(() => null),
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

it.each(['ctrl', 'meta'] as const)(
  'routes whole-take %s shortcuts through the actual store and protects input, locks and active history transactions',
  (modifier) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const initial = useVideoEditorStore.getState();
    const project = createVideoProjectFromRecording({
      recordingId: 'voice',
      filename: 'Source.webm',
      width: 640,
      height: 360,
      duration: 8,
      mimeType: 'video/webm',
      size: 100,
    });
    const source = project.clips.find((clip) => clip.type === 'VIDEO')!;
    if (source.type !== 'VIDEO') throw new Error('Missing source');
    const asset = project.assets.find((asset) => asset.id === source.assetId)!;
    const voice = createVideoProjectAsset(
      'Voice',
      'AUDIO',
      { kind: 'project-asset', projectAssetId: 'take-bytes' },
      { ...asset.metadata, width: 0, height: 0, mimeType: 'audio/wav', hasAudio: true }
    );
    project.assets.push(voice);
    const track = createVideoProjectTrack('Voice', 1, 'AUDIO');
    project.tracks.push(track);
    const reference = buildReviewTimeMap(8, []);
    project.version = 31;
    project.sourceVoiceoverDocuments = [
      {
        id: 'document',
        enabled: true,
        trackId: track.id,
        binding: {
          kind: 'source',
          assetId: source.assetId,
          sourceInstanceId: source.sourceInstanceId ?? source.id,
        },
        reference,
        take: anchorReviewVoiceoverAtSource(
          {
            id: 'take',
            assetId: voice.id,
            timelineStart: 0,
            sourceOffset: 0,
            duration: 2,
            volume: 1,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
          },
          reference
        ),
      },
    ];
    expect(isExportReadyVideoProject(project)).toBe(true);
    useVideoEditorStore.getState().setProject(project);
    useVideoEditorStore.getState().selectSourceVoiceover('document');
    const clips = structuredClone(useVideoEditorStore.getState().project!.clips);
    const assets = structuredClone(useVideoEditorStore.getState().project!.assets);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    function Harness() {
      const state = useVideoEditorStore();
      const latest: PlaybackLatestState = {
        currentTime: state.currentTime,
        isPlaying: false,
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
      return <input defaultValue="Protected draft" />;
    }
    const press = (code: string, ctrlKey = false, target: HTMLElement = document.body) =>
      act(() => {
        target.dispatchEvent(
          new KeyboardEvent('keydown', {
            code,
            ctrlKey: ctrlKey && modifier === 'ctrl',
            metaKey: ctrlKey && modifier === 'meta',
            bubbles: true,
            cancelable: true,
          })
        );
      });
    try {
      act(() => root.render(<Harness />));
      press('Delete', false, host.querySelector('input')!);
      press('KeyD', true, host.querySelector('input')!);
      expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toHaveLength(1);
      press('KeyD', true);
      expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toHaveLength(2);
      expect(useVideoEditorStore.getState().selection).not.toEqual({
        kind: 'source-voiceover',
        documentId: 'document',
      });
      act(() => useVideoEditorStore.getState().undoProject());
      expect(useVideoEditorStore.getState().selection).toEqual({
        kind: 'source-voiceover',
        documentId: 'document',
      });
      act(() => useVideoEditorStore.getState().toggleTrackLock(track.id));
      const locked = useVideoEditorStore.getState().project;
      const lockedHistory = useVideoEditorStore.getState().projectHistory;
      press('KeyD', true);
      press('Delete');
      expect(useVideoEditorStore.getState().project).toBe(locked);
      expect(useVideoEditorStore.getState().projectHistory).toBe(lockedHistory);
      act(() => useVideoEditorStore.getState().toggleTrackLock(track.id));
      let lease: ReturnType<typeof initial.beginProjectHistoryTransaction>;
      act(() => {
        lease = useVideoEditorStore.getState().beginProjectHistoryTransaction();
      });
      press('KeyD', true);
      press('Delete');
      expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toHaveLength(1);
      expect(useVideoEditorStore.getState().isProjectHistoryTransactionCurrent(lease!)).toBe(true);
      act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease!));
      press('KeyS');
      expect(useVideoEditorStore.getState().project!.clips).toEqual(clips);
      press('Delete');
      expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toEqual([]);
      expect(useVideoEditorStore.getState().selection).toEqual({ kind: 'scene' });
      act(() => useVideoEditorStore.getState().undoProject());
      expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toHaveLength(1);
      expect(useVideoEditorStore.getState().selection).toEqual({
        kind: 'source-voiceover',
        documentId: 'document',
      });
      act(() => useVideoEditorStore.getState().redoProject());
      expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toEqual([]);
      expect(useVideoEditorStore.getState().project!.clips).toEqual(clips);
      expect(useVideoEditorStore.getState().project!.assets).toEqual(assets);
    } finally {
      act(() => root.unmount());
      host.remove();
      useVideoEditorStore.setState(initial, true);
      vi.unstubAllGlobals();
    }
  }
);
