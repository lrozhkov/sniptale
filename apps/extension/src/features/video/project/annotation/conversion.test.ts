import { expect, it } from 'vitest';
import { createTextClip } from '../factories/overlay-clip';
import { convertTextClipToAnnotationClip } from './conversion';
import { VideoOverlayTemplateKind, VideoProjectClipType } from '../types/index';

it('converts text clips into annotation clips while preserving timing and placement', () => {
  const textClip = createTextClip('track-overlay', 1280, 720, 1.5);

  textClip.id = 'clip-text';
  textClip.name = 'Manual title';
  textClip.duration = 3.2;
  textClip.text = 'Launch update\nShipped to production';
  textClip.transform = { x: 120, y: 80, width: 420, height: 120, rotation: 6, opacity: 0.84 };
  textClip.style = {
    ...textClip.style,
    backgroundColor: '#111827',
    borderColor: '#f97316',
    borderRadius: 14,
    borderWidth: 2,
    color: '#f8fafc',
    padding: 10,
  };

  const annotationClip = convertTextClipToAnnotationClip(
    { height: 720, width: 1280 },
    textClip,
    VideoOverlayTemplateKind.TITLE_REVEAL
  );

  expect(annotationClip).toMatchObject({
    content: {
      badge: null,
      headline: 'Launch update',
      subline: 'Shipped to production',
    },
    duration: 3.2,
    id: 'clip-text',
    name: 'Manual title',
    style: expect.objectContaining({
      accentColor: '#f97316',
      backgroundColor: '#111827',
      borderRadius: 14,
      headlineColor: '#f8fafc',
      padding: 10,
    }),
    templateKind: VideoOverlayTemplateKind.TITLE_REVEAL,
    transform: { x: 120, y: 80, width: 420, height: 120, rotation: 6, opacity: 0.84 },
    type: VideoProjectClipType.ANNOTATION,
  });
});

it('keeps annotation defaults when text styling is transparent or empty', () => {
  const textClip = createTextClip('track-overlay', 1280, 720, 0.5);

  textClip.text = '   ';
  textClip.style = {
    ...textClip.style,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    padding: 0,
  };

  const annotationClip = convertTextClipToAnnotationClip(
    { height: 720, width: 1280 },
    textClip,
    VideoOverlayTemplateKind.LOWER_THIRD_BASIC
  );

  expect(annotationClip.content.headline).not.toBe('');
  expect(annotationClip.content.badge).not.toBeNull();
  expect(annotationClip.style.backgroundColor).not.toBe('transparent');
});
