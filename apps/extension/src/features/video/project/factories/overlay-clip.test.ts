import { expect, it, vi } from 'vitest';
import { APPLE_GLASS_ANNOTATION_PACK } from '../annotation-engine';
import {
  createAnnotationClip,
  createShapeClip,
  createSubtitleClip,
  createTextClip,
} from './overlay-clip';
import { VideoProjectShapeType } from '../types/index';

it('creates text overlays with detached defaults and audio envelope fields', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000001');

  expect(createTextClip('track-overlay', 1000, 600, 2)).toMatchObject({
    duration: 5,
    groupId: null,
    id: '00000000-0000-0000-0000-000000000001',
    linkMode: 'DETACHED',
    muted: true,
    startTime: 2,
    trackId: 'track-overlay',
    type: 'TEXT',
    volume: 1,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  });
});

it('creates both shape variants with independent styles and detached defaults', () => {
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-0000-0000-000000000002')
    .mockReturnValueOnce('00000000-0000-0000-0000-000000000003');

  const ellipse = createShapeClip('track-overlay', 1000, 600, 1, VideoProjectShapeType.ELLIPSE);
  const rectangle = createShapeClip('track-overlay', 1000, 600, 3, VideoProjectShapeType.RECTANGLE);
  const line = createShapeClip('track-overlay', 1000, 600, 3, VideoProjectShapeType.LINE);
  const arrow = createShapeClip('track-overlay', 1000, 600, 3, VideoProjectShapeType.ARROW);

  expect(ellipse).toMatchObject({
    id: '00000000-0000-0000-0000-000000000002',
    shapeType: VideoProjectShapeType.ELLIPSE,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  });
  expect(rectangle).toMatchObject({
    id: '00000000-0000-0000-0000-000000000003',
    shapeType: VideoProjectShapeType.RECTANGLE,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  });
  expect(ellipse.style).not.toBe(rectangle.style);
  expect(line).toMatchObject({
    name: 'Линия',
    shapeType: VideoProjectShapeType.LINE,
    transform: { height: 3, width: 280 },
  });
  expect(arrow).toMatchObject({
    name: 'Стрелка',
    shapeType: VideoProjectShapeType.ARROW,
    transform: { height: 3, width: 280 },
  });
});

it('creates subtitle overlays with the subtitle transform and detached timing fields', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000006');

  expect(createSubtitleClip('track-subtitle', 1000, 600, 5)).toMatchObject({
    duration: 5,
    id: '00000000-0000-0000-0000-000000000006',
    startTime: 5,
    trackId: 'track-subtitle',
    type: 'SUBTITLE',
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  });
});

it('creates annotation overlays with lower-third defaults and detached timing fields', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000004');

  expect(createAnnotationClip('track-overlay', 1000, 600, 4)).toMatchObject({
    duration: 4.8,
    id: '00000000-0000-0000-0000-000000000004',
    introAnimation: 'SLIDE_UP_FADE',
    outroAnimation: 'REVEAL_MASK',
    templateKind: 'LOWER_THIRD_BASIC',
    trackId: 'track-overlay',
    type: 'ANNOTATION',
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  });
});

it('creates annotation overlays from declarative template inputs', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000005');
  const template = APPLE_GLASS_ANNOTATION_PACK.templates.callout.find(
    (candidate) => candidate.id === 'crawling-arrow-card'
  );
  if (!template) {
    throw new Error('Expected Apple Glass callout template');
  }

  expect(
    createAnnotationClip('track-overlay', 1000, 600, 4, {
      packLabel: APPLE_GLASS_ANNOTATION_PACK.label,
      template,
      templateRef: {
        packId: APPLE_GLASS_ANNOTATION_PACK.packId,
        templateId: template.id,
      },
    })
  ).toMatchObject({
    duration: 3,
    id: '00000000-0000-0000-0000-000000000005',
    name: 'Guided Arrow Card',
    templateKind: 'CALLOUT_CONNECTOR',
    templateRef: {
      packId: APPLE_GLASS_ANNOTATION_PACK.packId,
      templateId: 'crawling-arrow-card',
    },
  });
});
