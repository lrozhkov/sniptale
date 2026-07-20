import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createDefaultMotionPath } from '../../../../../../features/video/project/motion/path';
import type { VideoObjectTrack } from '../../../../../../features/video/project/object-tracks';
import { MotionPathActions } from './actions';
import { createMotionPanelProps } from '../test-support';

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('enables cursor path generation when the hidden camera track needs anchors but has samples', () => {
  const panel = createMotionPanelProps();
  panel.project.objectTracks = [createCameraCursorTrack('needsAnchor')];
  const motionRegion = panel.selectedMotionRegion!;
  const path = motionRegion.path ?? createDefaultMotionPath(panel.project, motionRegion);

  const markup = renderToStaticMarkup(
    <MotionPathActions motionRegion={motionRegion} panel={panel} path={path} />
  );

  expect(markup).toContain('videoEditor.sidebar.motionPathGenerateFromCursor');
  expect(markup).not.toContain('disabled=""');
});

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
