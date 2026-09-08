import { resolveCameraClip } from '../../../../features/video/project/camera/animation';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import {
  VideoProjectAssetType,
  VideoProjectTrackRole,
  VideoTrackKind,
} from '../../../../features/video/project/types';
import { VideoProjectCameraLayout } from '../../../../features/video/project/camera/placement';
import { useVideoEditorStore } from '../../../state/store';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { createWorkspaceSidebarController, createWorkspaceSidebarTrackActions } from './sidebar';

it('projects track metadata actions into the sidebar without adding another state owner', () => {
  const store = {
    renameTrack: vi.fn(),
    toggleTrackLock: vi.fn(),
    toggleTrackVisibility: vi.fn(),
    toggleUtilityLaneVisibility: vi.fn(),
    toggleUtilityLaneLock: vi.fn(),
    clearUtilityLane: vi.fn(),
  };

  const actions = createWorkspaceSidebarTrackActions(store);

  expect(actions.onToggleUtilityLaneVisibility).toBe(store.toggleUtilityLaneVisibility);
  expect(actions.onToggleUtilityLaneLock).toBe(store.toggleUtilityLaneLock);
  expect(actions.onClearUtilityLane).toBe(store.clearUtilityLane);
  expect(actions.onRenameTrack).toBe(store.renameTrack);
  expect(actions.onToggleTrackLock).toBe(store.toggleTrackLock);
  expect(actions.onToggleTrackVisibility).toBe(store.toggleTrackVisibility);
});

it('uses the track action projection in the complete sidebar controller', () => {
  const project = createEmptyVideoProject('Sidebar controller');
  const renameTrack = vi.fn();
  const toggleTrackLock = vi.fn();
  const toggleTrackVisibility = vi.fn();
  const fallback = vi.fn();
  const dependencyProxy = (overrides: Record<string, unknown> = {}) =>
    new Proxy(overrides, {
      get(target, property) {
        return Reflect.has(target, property) ? Reflect.get(target, property) : fallback;
      },
    });
  const store = dependencyProxy({
    placementMode: null,
    project,
    recordingId: null,
    renameTrack,
    toggleTrackLock,
    toggleTrackVisibility,
  });
  const workspace = dependencyProxy({
    grid: dependencyProxy(),
    inspector: dependencyProxy({ mode: 'selection' }),
    sceneBackgroundColors: dependencyProxy({ recentColors: [] }),
  });

  const controller = createWorkspaceSidebarController(
    {
      actions: dependencyProxy(),
      libraries: dependencyProxy({ projects: [], recordings: [] }),
      selections: dependencyProxy({ selection: { kind: 'scene' } }),
      store,
      workspace,
    } as unknown as Parameters<typeof createWorkspaceSidebarController>[0],
    project,
    dependencyProxy() as Parameters<typeof createWorkspaceSidebarController>[2]
  );

  expect(controller.projectActions.onRenameTrack).toBe(renameTrack);
  expect(controller.projectActions.onToggleTrackLock).toBe(toggleTrackLock);
  expect(controller.projectActions.onToggleTrackVisibility).toBe(toggleTrackVisibility);

  const fallbackController = createWorkspaceSidebarController(
    {
      actions: dependencyProxy(),
      libraries: dependencyProxy({ projects: [], recordings: [] }),
      selections: {
        selection: undefined,
        selectedActionOccurrence: null,
        selectedClip: null,
        selectedCursorSample: null,
        selectedMotionRegion: null,
        selectedObjectTrack: null,
        selectedTrack: null,
        selectedTransition: null,
      },
      store,
      workspace,
    } as unknown as Parameters<typeof createWorkspaceSidebarController>[0],
    project,
    dependencyProxy() as Parameters<typeof createWorkspaceSidebarController>[2]
  );
  expect(fallbackController.state.selection).toEqual({ kind: 'scene' });
});

function createCameraControllerFixture() {
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
  const project = createEmptyVideoProject('Camera controller');
  const track = {
    ...createVideoProjectTrack('Camera', 1, VideoTrackKind.PRIMARY),
    role: VideoProjectTrackRole.CAMERA,
  };
  const asset = createVideoProjectAsset(
    'Camera',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'camera-source' },
    {
      width: 640,
      height: 480,
      duration: 8,
      mimeType: 'video/mp4',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const camera = createVideoClipFromAsset(track.id, asset, project.width, project.height, 1);
  project.tracks.push(track);
  project.assets.push(asset);
  if (camera.type !== 'VIDEO') throw new Error('Expected a video camera fixture');
  project.clips.push({ ...camera, duration: 4, sourceDuration: 4 });
  project.duration = 5;
  useVideoEditorStore.getState().setProject(project);
  const fallback = vi.fn();
  const dependencyProxy = (overrides: Record<string, unknown> = {}) =>
    new Proxy(overrides, {
      get: (target, key) => (Reflect.has(target, key) ? Reflect.get(target, key) : fallback),
    });
  const controller = () => {
    const store = useVideoEditorStore.getState();
    return createWorkspaceSidebarController(
      {
        store,
        actions: dependencyProxy(),
        libraries: { projects: [], recordings: [] },
        selections: {
          selectedClip: store.project?.clips.find((clip) => clip.id === camera.id) ?? null,
          selection: { kind: 'clip', clipId: camera.id },
          selectedTrack: null,
        },
        workspace: dependencyProxy({
          grid: dependencyProxy(),
          inspector: { mode: 'selection' },
          sceneBackgroundColors: dependencyProxy({ recentColors: [] }),
        }),
      } as unknown as Parameters<typeof createWorkspaceSidebarController>[0],
      store.project!,
      dependencyProxy() as Parameters<typeof createWorkspaceSidebarController>[2]
    );
  };
  return { controller, cameraId: camera.id, trackId: track.id };
}

afterEach(() => useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true));

it('commits a camera layout through updateProject as one undoable visual edit', () => {
  const { controller, cameraId } = createCameraControllerFixture();
  const before = useVideoEditorStore.getState().project!;
  controller().clipActions.onApplyCameraLayout?.(cameraId, VideoProjectCameraLayout.FULLFRAME);
  const after = useVideoEditorStore.getState().project!;
  expect(after.clips.find((clip) => clip.id === cameraId)).toMatchObject({
    fitMode: 'COVER',
    transform: { x: 0, y: 0, width: before.width, height: before.height, opacity: 1 },
  });
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  useVideoEditorStore.getState().undoProject();
  expect(useVideoEditorStore.getState().project?.clips).toEqual(before.clips);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  useVideoEditorStore.getState().redoProject();
  expect(useVideoEditorStore.getState().project?.clips).toEqual(after.clips);
});

it('adds a source-time position without splitting and restores it through Undo/Redo', () => {
  const { controller, cameraId } = createCameraControllerFixture();
  useVideoEditorStore.getState().setCurrentTime(1);
  expect(controller().state.canAddCameraPosition).toBe(false);
  useVideoEditorStore.getState().setCurrentTime(5);
  expect(controller().state.canAddCameraPosition).toBe(false);
  useVideoEditorStore.getState().setCurrentTime(3);
  const live = controller();
  expect(live.state.canAddCameraPosition).toBe(true);
  live.clipActions.onEditCameraPosition?.(cameraId, { kind: 'add' });
  expect(useVideoEditorStore.getState().currentTime).toBe(3.5);
  expect(
    useVideoEditorStore.getState().project?.clips.map((clip) => [clip.startTime, clip.duration])
  ).toEqual([[1, 4]]);
  const edited = useVideoEditorStore.getState().project!;
  expect(edited.clips[0]).toMatchObject({
    cameraPositions: [{ sourceTime: 2, transition: { kind: 'smooth' } }],
  });
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  useVideoEditorStore.getState().undoProject();
  expect(useVideoEditorStore.getState().project?.clips[0]).not.toHaveProperty('cameraPositions');
  useVideoEditorStore.getState().redoProject();
  expect(useVideoEditorStore.getState().project?.clips).toEqual(edited.clips);
});

it('does not mutate a locked camera through either inspector callback', () => {
  const { controller, cameraId, trackId } = createCameraControllerFixture();
  const project = useVideoEditorStore.getState().project!;
  useVideoEditorStore.getState().setProject({
    ...project,
    tracks: project.tracks.map((track) =>
      track.id === trackId ? { ...track, locked: true } : track
    ),
  });
  useVideoEditorStore.getState().setCurrentTime(3);
  const locked = controller();
  expect(locked.state.canAddCameraPosition).toBe(false);
  locked.clipActions.onApplyCameraLayout?.(cameraId, VideoProjectCameraLayout.HIDDEN);
  locked.clipActions.onEditCameraPosition?.(cameraId, { kind: 'add' });
  expect(useVideoEditorStore.getState().project?.clips).toEqual(project.clips);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
});

it('keeps a camera curve through real split and duplicate commands, with independent edits', () => {
  const { controller, cameraId } = createCameraControllerFixture();
  useVideoEditorStore.getState().setCurrentTime(2);
  controller().clipActions.onEditCameraPosition?.(cameraId, { kind: 'add' });
  controller().clipActions.onApplyCameraLayout?.(cameraId, VideoProjectCameraLayout.FULLFRAME);
  const original = useVideoEditorStore.getState().project!.clips[0]!;
  if (original.type !== 'VIDEO') throw new Error('Expected camera');
  const time = 2.25;
  const expected = resolveCameraClip(original, time).transform;
  useVideoEditorStore.getState().splitClipAt(cameraId, time);
  const right = useVideoEditorStore
    .getState()
    .project!.clips.find((clip) => clip.startTime === time)!;
  if (right.type !== 'VIDEO') throw new Error('Expected split camera');
  expect(resolveCameraClip(right, time).transform).toEqual(expected);
  useVideoEditorStore.getState().duplicateClip(right.id);
  const duplicate = useVideoEditorStore
    .getState()
    .project!.clips.find((clip) => clip.id !== right.id && clip.id !== original.id)!;
  if (duplicate.type !== 'VIDEO') throw new Error('Expected duplicate camera');
  expect(resolveCameraClip(duplicate, duplicate.startTime).transform).toEqual(expected);
  useVideoEditorStore.getState().setCurrentTime(duplicate.startTime + 1);
  useVideoEditorStore.getState().updateClipTransform(duplicate.id, { rotation: 25 });
  const updated = useVideoEditorStore.getState().project!;
  expect(updated.clips.find((clip) => clip.id === right.id)).toEqual(right);
  const copy = updated.clips.find((clip) => clip.id === duplicate.id)!;
  if (copy.type !== 'VIDEO') throw new Error('Expected duplicate camera');
  expect(copy.cameraPositions![0]!.transform.rotation).toBe(25);
});
