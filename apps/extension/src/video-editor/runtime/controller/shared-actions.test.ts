import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { hydrateVideoProject } from '../../../features/video/project/hydration';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers.ts';
import type { VideoProject } from '../../../features/video/project/types';
import { useVideoEditorStore } from '../../state/store';
import {
  createWorkspaceProjectUpdaters,
  createWorkspacePreviewProjectUpdaters,
} from './shared-actions';

it('stamps manually authored actions and cursor samples with durable project-time ownership', () => {
  const project = createProject([createVideoClip()]);
  project.baseRecordingId = 'rec-asset-video';
  project.source = { kind: 'recording', recordingId: 'rec-asset-video' };
  const store = createStore(project);
  const actions = createWorkspaceProjectUpdaters(store);

  actions.enableCursorTrack();
  actions.addActionEvent('CLICK_RIPPLE');

  expect(project.cursorTrack?.samples[0]?.timeBasis).toBe('project');
  expect(project.actionEvents[0]?.anchor).toEqual({
    kind: 'project',
    time: store.getCurrentTime(),
  });
  expect(project.actionEvents[0]?.presentation).toBeUndefined();

  const reloaded = hydrateVideoProject(project);
  expect(reloaded.cursorTrack?.samples[0]).not.toHaveProperty('sourceAnchor');
  expect(reloaded.actionEvents[0]).not.toHaveProperty('sourceAnchor');
});

it('keeps a manual click on the history defaults and rejects edits on a locked history lane', () => {
  const project = createEmptyVideoProject('Manual history');
  const actions = createWorkspaceProjectUpdaters(createStore(project));
  actions.addActionEvent('CLICK_RIPPLE');
  expect(project.actionEvents).toHaveLength(1);
  expect(project.actionEvents[0]?.presentation).toBeUndefined();
  expect(project.actionEvents[0]?.label).toBe('');
  project.utilityLanes = {
    actions: { visible: true, locked: true },
    camera: { visible: true, locked: false },
  };
  actions.addActionEvent('CLICK_RIPPLE');
  actions.deleteActionEvent(project.actionEvents[0]!.id);
  expect(project.actionEvents).toHaveLength(1);
});

type TestVideoProject = VideoProject;

function createStore(project: TestVideoProject) {
  return {
    ...useVideoEditorStore.getInitialState(),
    getCurrentTime: () => 0,
    project,
    recordingTelemetry: [],
    selectMotionRegion: vi.fn(),
    updateProject: (updater: (current: TestVideoProject) => TestVideoProject) => {
      const nextProject = updater(project);
      Object.assign(project, nextProject);
    },
  };
}

it.each([createWorkspaceProjectUpdaters, createWorkspacePreviewProjectUpdaters])(
  'recreates the first zoom as visible and editable in the same project update (%#)',
  (createActions) => {
    const project = createEmptyVideoProject('Zoom');
    project.duration = 10;
    project.utilityLanes = {
      actions: { visible: true, locked: false },
      camera: { visible: false, locked: true },
    };
    const store = createStore(project);
    const update = vi.spyOn(store, 'updateProject');
    createActions(store).addMotionRegion(0);
    expect(update).toHaveBeenCalledTimes(1);
    expect(project.motionRegions).toHaveLength(1);
    expect(project.utilityLanes?.camera).toEqual({ visible: true, locked: false });
  }
);

it('rejects an occupied zoom insertion and fits the next free gap', () => {
  const project = createEmptyVideoProject('Zoom placement');
  project.duration = 10;
  const store = createStore(project);
  const actions = createWorkspaceProjectUpdaters(store);
  actions.addMotionRegion(2);
  actions.addMotionRegion(3);
  expect(project.motionRegions).toHaveLength(1);
  actions.addMotionRegion(1);
  expect(project.motionRegions?.at(-1)).toMatchObject({ startTime: 1, duration: 1 });
});

it('uses current variants for independent edits and refuses invalid, equal and missing-resource updates', async () => {
  const project = createEmptyVideoProject('Background');
  const store = createStore(project),
    actions = createWorkspaceProjectUpdaters(store);
  actions.setSceneBackground({ kind: 'solid', color: '#123456' });
  const gradient = (
    await import('../../../features/video/project/scene/background-gradient')
  ).createSceneGradientBackground('#abcdef');
  actions.setSceneBackground({
    ...gradient,
    animation: { mode: 'breathe', speed: 42, intensity: 72 },
  });
  project.name = 'Unrelated edit';
  const before = structuredClone(project.sceneBackground);
  const observed: VideoProject[] = [];
  store.updateProject = (updater) => {
    const next = updater(project);
    observed.push(next);
    Object.assign(project, next);
  };
  actions.setSceneBackground({ kind: 'image', assetId: 'missing' });
  expect(observed.at(-1)).toBe(project);
  actions.setSceneBackground(project.sceneBackground!);
  expect(observed.at(-1)).toBe(project);
  const invalid = { kind: 'image', assetId: 'missing', imageFit: 'stretch' };
  expect(() => Reflect.apply(actions.setSceneBackground, actions, [invalid])).not.toThrow();
  expect(project.sceneBackground).toEqual(before);
  expect(project.name).toBe('Unrelated edit');
  actions.setSceneBackground({
    ...gradient,
    animation: { mode: 'rotate', speed: 20, intensity: 30 },
    remembered: {},
  });
  expect(project.sceneBackground?.remembered?.solid?.color).toBe('#123456');
});

it('records variant and fit edits through actual history and keeps retries as no-ops', async () => {
  const store = useVideoEditorStore;
  const project = createEmptyVideoProject('History');
  store.setState(store.getInitialState(), true);
  store.getState().setProject(project);
  const actions = createWorkspaceProjectUpdaters({
    ...store.getState(),
    getCurrentTime: () => store.getState().currentTime,
  });
  actions.setSceneBackground({ kind: 'solid', color: '#123456' });
  const solid = store.getState().project!;
  actions.setSceneBackground(
    (
      await import('../../../features/video/project/scene/background-gradient')
    ).createSceneGradientBackground()
  );
  const gradient = store.getState().project!;
  expect(gradient.version).toBe(14);
  expect(gradient.sceneBackground?.remembered?.solid?.color).toBe('#123456');
  const history = store.getState().projectHistory;
  actions.setSceneBackground(gradient.sceneBackground!);
  expect(store.getState().project).toBe(gradient);
  expect(store.getState().projectHistory).toBe(history);
  store.getState().undoProject();
  expect(store.getState().project?.sceneBackground).toEqual(solid.sceneBackground);
  store.getState().redoProject();
  expect(store.getState().project?.sceneBackground).toEqual(gradient.sceneBackground);
  store.setState(store.getInitialState(), true);
});

it('merges scalar blur with latest paint and image settings under the project updater', async () => {
  const project = createEmptyVideoProject('Latest background');
  const store = createStore(project);
  let pending: ((current: VideoProject) => VideoProject) | undefined;
  store.updateProject = (updater) => {
    pending = updater;
  };
  const actions = createWorkspaceProjectUpdaters(store);
  actions.setSceneBackground({ blur: 12.5 });
  project.sceneBackground = {
    ...(
      await import('../../../features/video/project/scene/background-gradient')
    ).createSceneGradientBackground('#111111ff'),
    animation: { mode: 'drift', speed: 72, intensity: 61 },
    remembered: { solid: { kind: 'solid', color: '#123456' } },
  };
  project.name = 'Latest unrelated edit';
  const latest = structuredClone(project);
  const next = pending!(project);
  expect(next.sceneBackground).toEqual({ ...latest.sceneBackground, blur: 12.5 });
  expect(next.name).toBe(latest.name);
  expect(project).toEqual(latest);
  project.sceneBackground = { kind: 'image', assetId: 'image', imageFit: 'contain' };
  project.assets = [
    { ...createProject([createVideoClip()]).assets[0]!, id: 'image', type: 'IMAGE' },
  ];
  expect(pending!(project).sceneBackground).toMatchObject({
    kind: 'image',
    assetId: 'image',
    imageFit: 'contain',
    blur: 12.5,
  });
});

it('records blur through actual history, refuses invalid edits and keeps retries as no-ops', () => {
  const store = useVideoEditorStore;
  store.setState(store.getInitialState(), true);
  store.getState().setProject(createEmptyVideoProject('Blur history'));
  const actions = createWorkspaceProjectUpdaters({ ...store.getState(), getCurrentTime: () => 0 });
  actions.setSceneBackground({ blur: 12.5 });
  const accepted = store.getState().project!,
    history = store.getState().projectHistory;
  expect(accepted.version).toBe(16);
  for (const value of [
    { blur: 12.5 },
    { blur: -1 },
    { blur: 26 },
    { blur: NaN },
    { blur: null },
    { blur: 4, extra: true },
    null,
  ])
    Reflect.apply(actions.setSceneBackground, actions, [value]);
  expect(store.getState().project).toBe(accepted);
  expect(store.getState().projectHistory).toBe(history);
  actions.setSceneBackground({ blur: 0 });
  expect(store.getState().project?.sceneBackground?.blur).toBe(0);
  expect(store.getState().project?.version).toBe(16);
  store.getState().undoProject();
  expect(store.getState().project?.sceneBackground?.blur).toBe(12.5);
  store.getState().redoProject();
  expect(store.getState().project?.sceneBackground?.blur).toBe(0);
  store.setState(store.getInitialState(), true);
});
