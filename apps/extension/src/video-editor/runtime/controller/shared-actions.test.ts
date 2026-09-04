import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion/index';
import type { VideoObjectTrack } from '../../../features/video/project/object-tracks';
import { hydrateVideoProject } from '../../../features/video/project/hydration';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers.ts';
import type { VideoProject } from '../../../features/video/project/types';
import { useVideoEditorStore } from '../../state/store';
import { createWorkspaceProjectUpdaters } from './shared-actions';

it('generates a camera path from a hidden detected cursor track that needs anchors', () => {
  const project = createEmptyVideoProject('Cursor camera');
  const motionRegion = createVideoProjectMotionRegion(project, 0);
  project.motionRegions = [motionRegion];
  project.objectTracks = [createCameraCursorTrack('needsAnchor')];
  const store = createStore(project);

  createWorkspaceProjectUpdaters(store).generateMotionPathFromCursor(motionRegion.id);

  const generatedPath = project.motionRegions?.[0]?.path;
  if (!generatedPath) {
    throw new Error('Expected cursor generation to keep a motion path.');
  }
  const stops = generatedPath.stops;
  expect(stops).toEqual([
    expect.objectContaining({ target: expect.objectContaining({ x: 120, y: 90 }) }),
    expect.objectContaining({ target: expect.objectContaining({ x: 360, y: 240 }) }),
  ]);
});

it('stamps manually authored actions and cursor samples with durable project-time ownership', () => {
  const project = createProject([createVideoClip()]);
  project.baseRecordingId = 'rec-asset-video';
  project.source = { kind: 'recording', recordingId: 'rec-asset-video' };
  const store = createStore(project);
  const actions = createWorkspaceProjectUpdaters(store);

  actions.enableCursorTrack();
  actions.addActionEvent('CLICK_RIPPLE');

  expect(project.cursorTrack?.samples[0]?.timeBasis).toBe('project');
  expect(project.actionEvents[0]?.timeBasis).toBe('project');

  const reloaded = hydrateVideoProject(project, { inferLegacyInteractionAnchors: true });
  expect(reloaded.cursorTrack?.samples[0]).not.toHaveProperty('sourceAnchor');
  expect(reloaded.actionEvents[0]).not.toHaveProperty('sourceAnchor');
});

type TestVideoProject = VideoProject;

function createStore(project: TestVideoProject) {
  return {
    ...useVideoEditorStore.getInitialState(),
    getCurrentTime: () => 0,
    project,
    recordingTelemetry: null,
    selectMotionRegion: vi.fn(),
    updateProject: (updater: (current: TestVideoProject) => TestVideoProject) => {
      const nextProject = updater(project);
      Object.assign(project, nextProject);
    },
  };
}

function createCameraCursorTrack(
  status: NonNullable<NonNullable<VideoObjectTrack['analysis']>['quality']>['status']
): VideoObjectTrack {
  return {
    analysis: {
      mode: 'coarseKeyframes',
      projectEndTime: 2,
      projectStartTime: 0,
      quality: {
        coverageRatio: 0.5,
        jumpCount: 1,
        medianConfidence: 0.55,
        status,
        visibleSamples: 2,
      },
      sampleFps: 1,
      sourceAssetId: 'asset-video',
      sourceClipId: 'clip-video',
    },
    hidden: true,
    id: 'visual-cursor',
    kind: 'visualCursor',
    role: 'cameraCursor',
    samples: [
      { confidence: 0.55, time: 0, visible: true, x: 120, y: 90 },
      { confidence: 0.58, time: 1, visible: true, x: 360, y: 240 },
    ],
    source: 'visualDetection',
  };
}
