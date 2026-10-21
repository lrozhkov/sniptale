import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { bindMotionRegionToClip } from '../../../../features/video/project/motion/source-binding';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers.ts';
import { reconcileRecordingInteractionAnchors } from '../../../project/operations/source-timed-clips';
import { projectCursorFocusTimelineKeys } from '../../../../features/video/project/cursor-focus-path/timeline';
import { cursorFocusOverrideId } from '../../../../features/video/project/cursor-focus-path/authoring';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import type { ClipSelectionPort } from '../../../contracts/controller-store';
import { useVideoEditorStore, type VideoEditorState } from '../../../state/store';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import type { VideoEditorRuntimeController } from '../../session';
import {
  createWorkspaceTimelineEditingActions,
  createWorkspaceTimelineSelectionActions,
} from './timeline-actions';
import { createWorkspaceTimelineController } from './timeline';

function createStore(project = createEmptyVideoProject('Timeline actions')) {
  const store: VideoEditorState & Pick<ClipSelectionPort, 'selectedClipId'> = {
    ...useVideoEditorStore.getInitialState(),
    project,
    recordingId: 'recording-1',
    selectedClipId: null,
    selection: { kind: VideoEditorSelectionKind.SCENE },
    setError: vi.fn(),
    updateClipPlaybackRate: vi.fn(),
    updateActionEventDetails: vi.fn(),
    updateProject: vi.fn((updater: (currentProject: typeof project) => typeof project) => {
      const currentProject = store.project;
      if (currentProject) store.project = updater(currentProject);
    }),
  };

  return store;
}

function createWorkspace(): Pick<
  VideoEditorWorkspaceState,
  | 'setAutoProcessingModalOpen'
  | 'clearPlaybackRange'
  | 'confirm'
  | 'inspector'
  | 'playbackRange'
  | 'setPlaybackRange'
> {
  return {
    setAutoProcessingModalOpen: vi.fn(),
    clearPlaybackRange: vi.fn(),
    playbackRange: null,
    inspector: {
      mode: 'selection',
      openSelection: vi.fn(),
      sceneEdgesPreview: null,
      previewSceneEdges: vi.fn(),
      watermarkPreview: null,
      previewWatermark: () => undefined,
      registerWatermarkAbort: () => () => undefined,
      cancelWatermarkAcquisition: () => undefined,
      motionPreview: null,
      previewMotion: vi.fn(),
    },
    confirm: {
      dialog: null,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      request: vi.fn(),
    },
    setPlaybackRange: vi.fn(),
  };
}

function createSelectedClipActions() {
  return {
    deleteSelectedClip: vi.fn(),
    duplicateSelectedClip: vi.fn(),
    splitSelectedClip: vi.fn(),
  };
}

it('routes timeline boundary controls through the playback seek pipeline', () => {
  const project = createEmptyVideoProject('Timeline boundaries');
  project.duration = 9.5;
  const seekTo = vi.fn();
  const actions = createWorkspaceTimelineSelectionActions(
    createStore(project),
    { seekTo, togglePlayback: vi.fn() } as unknown as VideoEditorRuntimeController,
    createWorkspace()
  );

  actions.onSeekToStart();
  actions.onSeekToEnd();

  expect(seekTo).toHaveBeenNthCalledWith(1, 0);
  expect(seekTo).toHaveBeenNthCalledWith(2, 9.5);
});

it('routes timeline frame controls through the playback frame-step authority', () => {
  const stepByFrames = vi.fn();
  const actions = createWorkspaceTimelineSelectionActions(
    createStore(),
    { stepByFrames, togglePlayback: vi.fn() } as unknown as VideoEditorRuntimeController,
    createWorkspace()
  );

  actions.onStepToPreviousFrame();
  actions.onStepToNextFrame();

  expect(stepByFrames.mock.calls).toEqual([[-1], [1]]);
});

it('projects valid selected-clip split eligibility into the timeline controller', () => {
  const project = createProject([createVideoClip()]);
  const store = createStore(project);
  store.currentTime = 3;
  store.selectedClipId = 'clip-video';
  store.selection = { kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-video' };
  type ControllerArgs = Parameters<typeof createWorkspaceTimelineController>;
  const runtime = {
    timelinePreviews: {},
    setTimelinePreviewSuspended: vi.fn(),
    setTimelinePreviewViewport: vi.fn(),
  } as unknown as ControllerArgs[1];
  const workspace = {
    ...createWorkspace(),
    grid: { magnetEnabled: true },
    playbackRange: null,
  } as unknown as ControllerArgs[4];
  const createController = () =>
    createWorkspaceTimelineController(
      store as unknown as ControllerArgs[0],
      runtime,
      project,
      {} as ControllerArgs[3],
      workspace,
      {} as ControllerArgs[5],
      createSelectedClipActions()
    );

  expect(createController().state.canSplitSelectedClip).toBe(true);
  expect(createController().state.canEditSelectedClip).toBe(true);
  project.tracks.find((track) => track.id === 'track-video')!.locked = true;
  expect(createController().state.canEditSelectedClip).toBe(false);
  project.tracks.find((track) => track.id === 'track-video')!.locked = false;
  store.currentTime = 0.05;
  expect(createController().state.canSplitSelectedClip).toBe(false);
  store.selectedClipId = null;
  expect(createController().state.canSplitSelectedClip).toBe(false);
});

it('deletes the selected object track from timeline delete actions', () => {
  const store = createStore();
  store.selection = {
    kind: VideoEditorSelectionKind.OBJECT_TRACK,
    objectTrackId: 'visual-cursor',
  };
  store.deleteObjectTrack = vi.fn();

  createWorkspaceTimelineEditingActions(
    store,
    createWorkspace(),
    createSelectedClipActions()
  ).onDeleteSelectedTimelineObject();

  expect(store.deleteObjectTrack).toHaveBeenCalledWith('visual-cursor');
});

it('deletes the selected effect instance from timeline delete actions', () => {
  const store = createStore();
  store.selection = {
    kind: VideoEditorSelectionKind.EFFECT_INSTANCE,
    effectInstanceId: 'effect-instance',
  };
  store.deleteEffectInstance = vi.fn();

  createWorkspaceTimelineEditingActions(
    store,
    createWorkspace(),
    createSelectedClipActions()
  ).onDeleteSelectedTimelineObject();

  expect(store.deleteEffectInstance).toHaveBeenCalledWith('effect-instance');
});

it('preserves captured facts while cursor moves remain explicit', () => {
  const project = createProject([createVideoClip({ sourceInstanceId: 'instance-video' })]);
  project.baseRecordingId = 'rec-asset-video';
  project.source = { kind: 'recording', recordingId: 'rec-asset-video' };
  project.actionEvents = [
    {
      data: {},
      id: 'action-1',
      kind: 'CLICK',
      label: 'Click',
      point: null,
      presentation: { preset: 'CLICK_RIPPLE' },
      anchor: {
        kind: 'recording-source',
        recordingId: 'rec-asset-video',
        sourceInstanceId: 'instance-video',
        sourceEventId: 'raw-click',
        sourceTime: 1,
      },
    },
  ];
  project.cursorTrack = {
    captureMode: 'separate',
    samples: [
      {
        id: 'cursor-1',
        sourceAnchor: {
          kind: 'recording-source',
          recordingId: 'rec-asset-video',
          sourceClipId: 'clip-video',
          sourceTime: 1,
        },
        time: 1,
        visible: true,
        recordingPoint: { x: 0.1, y: 0.2 },
        x: 10,
        y: 20,
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
  const store = createStore(project);
  const actions = createWorkspaceTimelineEditingActions(
    store,
    createWorkspace(),
    createSelectedClipActions()
  );

  actions.onMoveCursorSegment('cursor-1', null, 4, null);
  const detachedProject = store.project!;
  expect(detachedProject.cursorTrack).toEqual(project.cursorTrack);
  expect(projectCursorFocusTimelineKeys(detachedProject)).toContainEqual(
    expect.objectContaining({ id: cursorFocusOverrideId('cursor-1'), time: 4, sourceTime: 4 })
  );
  const sourceEdited = reconcileRecordingInteractionAnchors(detachedProject, {
    ...detachedProject,
    clips: detachedProject.clips.map((clip) => ({ ...clip, startTime: 2 })),
  });

  expect(sourceEdited.actionEvents).toEqual(project.actionEvents);
  expect(store.updateActionEventDetails).not.toHaveBeenCalled();
  expect(sourceEdited.cursorTrack?.samples[0]).toEqual({
    ...project.cursorTrack.samples[0],
    time: 3,
  });
  expect(sourceEdited.cursorFocusPath).toEqual(detachedProject.cursorFocusPath);
  expect(projectCursorFocusTimelineKeys(sourceEdited)).toContainEqual(
    expect.objectContaining({ id: cursorFocusOverrideId('cursor-1'), time: 6, sourceTime: 4 })
  );
});

it('clears the playback interval only for seeks outside its inclusive boundaries', () => {
  const workspace = { ...createWorkspace(), playbackRange: { start: 2, end: 5 } };
  const seekTo = vi.fn();
  const project = createEmptyVideoProject('Range seeks');
  project.duration = 10;
  const actions = createWorkspaceTimelineSelectionActions(
    createStore(project),
    { seekTo } as unknown as VideoEditorRuntimeController,
    workspace
  );
  for (const time of [2, 3, 5]) actions.onSeek(time);
  expect(workspace.clearPlaybackRange).not.toHaveBeenCalled();
  actions.onSeek(1);
  expect(workspace.clearPlaybackRange).toHaveBeenCalledTimes(1);
  actions.onSeek(6);
  expect(workspace.clearPlaybackRange).toHaveBeenCalledTimes(2);
  actions.onSeekToStart();
  actions.onSeekToEnd();
  expect(workspace.clearPlaybackRange).toHaveBeenCalledTimes(4);
  expect(seekTo.mock.calls).toEqual([[2], [3], [5], [1], [6], [0], [10]]);
});

it('commits timeline framing gestures through the real project state', () => {
  const originalState = useVideoEditorStore.getState();
  const clip = createVideoClip({ startTime: 2, duration: 8, sourceDuration: 8 });
  const project = createProject([clip]);
  const region = bindMotionRegionToClip(
    { ...createVideoProjectMotionRegion(project, 3), duration: 2 },
    clip
  );
  project.motionRegions = [region];
  try {
    useVideoEditorStore.getState().setProject(project);
    const actions = createWorkspaceTimelineEditingActions(
      { ...useVideoEditorStore.getState(), selectedClipId: null },
      createWorkspace(),
      createSelectedClipActions()
    );
    actions.onMoveMotionRegion(region.id, 6);
    expect(useVideoEditorStore.getState().project?.motionRegions?.[0]).toMatchObject({
      startTime: 6,
      duration: 2,
    });
    actions.onResizeMotionRegion(region.id, 5, 3);
    expect(useVideoEditorStore.getState().project?.motionRegions?.[0]).toMatchObject({
      startTime: 5,
      duration: 3,
    });
    useVideoEditorStore.getState().toggleUtilityLaneLock('camera');
    const locked = useVideoEditorStore.getState().project;
    actions.onMoveMotionRegion(region.id, 4);
    expect(useVideoEditorStore.getState().project).toBe(locked);
  } finally {
    useVideoEditorStore.setState(originalState, true);
  }
});

it('opens note selection in the inspector and routes Delete to the accepted note command', () => {
  const store = createStore();
  const project = store.project!;
  const selectComment = vi.fn();
  const editCommentDocument = vi.fn();
  store.selectComment = selectComment;
  store.editCommentDocument = editCommentDocument;
  store.selection = { kind: 'comment', documentId: 'doc', commentId: 'note' };
  const workspace = createWorkspace();
  const runtime = {
    seekTo: vi.fn(),
    togglePlayback: vi.fn(),
  } as unknown as VideoEditorRuntimeController;
  const selection = createWorkspaceTimelineSelectionActions(store, runtime, workspace);
  selection.onSelectComment('doc', 'note', 10);
  expect(selectComment).toHaveBeenCalledExactlyOnceWith('doc', 'note', 10);
  expect(workspace.inspector.openSelection).toHaveBeenCalledTimes(1);
  const clipActions = createSelectedClipActions();
  const editing = createWorkspaceTimelineEditingActions(store, workspace, clipActions);
  editing.onDeleteSelectedTimelineObject();
  expect(editCommentDocument).toHaveBeenCalledExactlyOnceWith(project, 'doc', {
    kind: 'remove-note',
    id: 'note',
  });
  expect(clipActions.deleteSelectedClip).not.toHaveBeenCalled();
});
