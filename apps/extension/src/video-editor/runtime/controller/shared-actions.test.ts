import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion/index';
import type { VideoObjectTrack } from '../../../features/video/project/object-tracks';
import type { VideoEditorControllerStorePort } from '../../contracts/controller-store';
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

function createStore(project: ReturnType<typeof createEmptyVideoProject>) {
  return {
    currentTime: 0,
    project,
    recordingTelemetry: null,
    selectMotionRegion: vi.fn(),
    updateProject: (updater) => {
      const nextProject = updater(project);
      Object.assign(project, nextProject);
    },
  } as Pick<
    VideoEditorControllerStorePort,
    'currentTime' | 'project' | 'recordingTelemetry' | 'selectMotionRegion' | 'updateProject'
  > as VideoEditorControllerStorePort;
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
