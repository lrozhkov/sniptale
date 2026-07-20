import { expect, it } from 'vitest';
import { createAnnotationClip } from '../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoMediaShadowMode,
  VideoProjectClipType,
  VideoProjectShapeType,
  type VideoProjectAnnotationClip,
  type VideoProjectShapeClip,
  type VideoProjectTextClip,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import { createVideoProject } from '../../../project/test-support/fixtures';
import {
  getAnnotationPreviewClipStyle,
  getMediaFitClass,
  getPreviewClipCommonStyle,
  getShapePreviewClipStyle,
  getTextPreviewClipStyle,
} from './clip-layout';

function createBaseClip(overrides: Record<string, unknown> = {}) {
  return {
    assetId: 'asset-1',
    duration: 5,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Clip 1',
    sourceDuration: 5,
    sourceStart: 0,
    startTime: 0,
    trackId: 'track-1',
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: {
      height: 100,
      opacity: 1,
      rotation: 15,
      width: 200,
      x: 50,
      y: 25,
    },
    volume: 1,
    ...overrides,
  };
}

function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    ...createBaseClip(),
    type: VideoProjectClipType.VIDEO,
    ...overrides,
  };
}

function createTextClip(overrides: Partial<VideoProjectTextClip> = {}): VideoProjectTextClip {
  return {
    ...createBaseClip(),
    type: VideoProjectClipType.TEXT,
    style: {
      backgroundColor: '#111111',
      borderColor: '#222222',
      borderRadius: 12,
      borderWidth: 2,
      color: '#ffffff',
      fontFamily: 'serif',
      fontSize: 24,
      fontWeight: 600,
      lineHeight: 1.4,
      padding: 16,
      textAlign: 'center',
    },
    text: 'Preview copy',
    ...overrides,
  };
}

function createShapeClip(overrides: Partial<VideoProjectShapeClip> = {}): VideoProjectShapeClip {
  return {
    ...createBaseClip(),
    type: VideoProjectClipType.SHAPE,
    shapeType: VideoProjectShapeType.RECTANGLE,
    style: {
      borderRadius: 10,
      fillColor: '#336699',
      strokeColor: '#224466',
      strokeWidth: 3,
    },
    ...overrides,
  };
}

function createAnnotationOverlayClip(
  project: ReturnType<typeof createVideoProject>
): VideoProjectAnnotationClip {
  const overlayProject = createEmptyVideoProject('Preview');
  const clip = createAnnotationClip(overlayProject.tracks[2]!.id, project.width, project.height, 0);
  clip.transform.rotation = 15;
  return clip;
}

it('builds preview clip geometry as stage-relative percentages', () => {
  const clip = createVideoClip({ shadowIntensity: 50 });
  const project = createVideoProject({ height: 200, width: 400 });

  expect(getPreviewClipCommonStyle(clip, 0, project)).toEqual(
    expect.objectContaining({
      height: '50%',
      left: '12.5%',
      opacity: 1,
      position: 'absolute',
      top: '12.5%',
      transform: 'rotate(15deg)',
      transformOrigin: 'center center',
      width: '50%',
      boxShadow: '0px 0px 24px rgba(0, 0, 0, 0.28)',
      overflow: 'visible',
      zIndex: 1,
    })
  );
});

it('builds glow media shadows without the backdrop offset', () => {
  const clip = createVideoClip({
    shadowIntensity: 50,
    shadowMode: VideoMediaShadowMode.GLOW,
  });
  const project = createVideoProject({ height: 200, width: 400 });

  expect(getPreviewClipCommonStyle(clip, 0, project)).toEqual(
    expect.objectContaining({
      boxShadow: '0px 0px 29px rgba(255, 255, 255, 0.34)',
      overflow: 'visible',
    })
  );
});

it('derives text preview style from clip typography and frame settings', () => {
  const style = getTextPreviewClipStyle(createVideoProject({ tracks: [] }), createTextClip(), {
    left: '10%',
  });

  expect(style).toEqual(
    expect.objectContaining({
      backgroundColor: '#111111',
      borderColor: '#222222',
      borderRadius: '12px',
      borderWidth: '2px',
      color: '#ffffff',
      fontFamily: 'serif',
      fontSize: '24px',
      fontWeight: 600,
      left: '10%',
      lineHeight: 1.4,
      padding: '16px',
      textAlign: 'center',
    })
  );
});

it('derives shape preview style with ellipse-specific radius handling', () => {
  const rectangleStyle = getShapePreviewClipStyle(createShapeClip(), { top: '20%' });
  const ellipseStyle = getShapePreviewClipStyle(
    createShapeClip({ shapeType: VideoProjectShapeType.ELLIPSE }),
    { top: '20%' }
  );
  const lineStyle = getShapePreviewClipStyle(
    createShapeClip({ shapeType: VideoProjectShapeType.LINE }),
    { top: '20%' }
  );

  expect(rectangleStyle).toEqual(
    expect.objectContaining({
      backgroundColor: '#336699',
      borderColor: '#224466',
      borderRadius: '10px',
      borderWidth: '3px',
      top: '20%',
    })
  );
  expect(ellipseStyle.borderRadius).toBe('9999px');
  expect(lineStyle).toEqual(
    expect.objectContaining({
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      overflow: 'visible',
      top: '20%',
    })
  );
});

it('keeps annotation preview transforms aligned with composition rotation and motion effects', () => {
  const project = createVideoProject();
  const clip = createAnnotationOverlayClip(project);

  expect(getAnnotationPreviewClipStyle(project, clip, 1)).toEqual(
    expect.objectContaining({
      filter: 'blur(0.00px)',
      opacity: 1,
      position: 'absolute',
      transform: 'translate(0px, 0px) scale(1.000) rotate(15deg)',
      transformOrigin: 'center center',
    })
  );
});

it('uses the annotation label frame as the preview body viewport for target-aware scenes', () => {
  const project = createVideoProject({ height: 720, width: 1280 });
  const clip = createAnnotationOverlayClip(project);
  clip.transform = {
    ...clip.transform,
    height: 80,
    width: 240,
    x: 320,
    y: 180,
  };
  clip.targetRect = { height: 96, width: 180, x: 720, y: 360 };

  expect(getAnnotationPreviewClipStyle(project, clip, 1)).toEqual(
    expect.objectContaining({
      height: `${(clip.transform.height / project.height) * 100}%`,
      left: `${(clip.transform.x / project.width) * 100}%`,
      top: `${(clip.transform.y / project.height) * 100}%`,
      width: `${(clip.transform.width / project.width) * 100}%`,
    })
  );
});

it('maps media fit modes to explicit preview object-fit classes', () => {
  expect(getMediaFitClass(VideoMediaFitMode.CONTAIN)).toBe('object-contain');
  expect(getMediaFitClass(VideoMediaFitMode.COVER)).toBe('object-cover');
  expect(getMediaFitClass(VideoMediaFitMode.STRETCH)).toBe('object-fill');
});
