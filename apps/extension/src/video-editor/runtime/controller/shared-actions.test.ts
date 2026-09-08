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
