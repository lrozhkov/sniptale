import { expect, it } from 'vitest';
import {
  getCompatibleAnnotationTemplateKinds,
  isTargetAwareAnnotationTemplate,
  resolveAnnotationTemplateTraits,
} from './template-families';
import { VideoOverlayTemplateKind } from '../types/index';

it('keeps shared annotation traits aligned with overlay template definitions', () => {
  expect(resolveAnnotationTemplateTraits(VideoOverlayTemplateKind.CALLOUT_CARD)).toEqual({
    annotationFamily: 'CALLOUT',
    motionFamily: 'FRAME_TRACE',
    renderFamily: 'FRAME',
  });
  expect(resolveAnnotationTemplateTraits(VideoOverlayTemplateKind.POINTER_LABEL)).toEqual({
    annotationFamily: 'POINTER',
    motionFamily: 'MARKER_POP',
    renderFamily: 'MARKER',
  });
  expect(resolveAnnotationTemplateTraits(VideoOverlayTemplateKind.FOCUS_SCAN_FRAME)).toEqual({
    annotationFamily: 'SPOTLIGHT',
    motionFamily: 'PULSE_SPOTLIGHT',
    renderFamily: 'SPOTLIGHT',
  });
});

it('detects target-aware templates through the shared capability resolver', () => {
  expect(isTargetAwareAnnotationTemplate(VideoOverlayTemplateKind.CALLOUT_CARD)).toBe(true);
  expect(isTargetAwareAnnotationTemplate(VideoOverlayTemplateKind.CALLOUT_CONNECTOR)).toBe(true);
  expect(isTargetAwareAnnotationTemplate(VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD)).toBe(
    true
  );
  expect(
    isTargetAwareAnnotationTemplate(VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER)
  ).toBe(true);
  expect(isTargetAwareAnnotationTemplate(VideoOverlayTemplateKind.FOCUS_SCAN_FRAME)).toBe(true);
  expect(isTargetAwareAnnotationTemplate(VideoOverlayTemplateKind.LOWER_THIRD_BASIC)).toBe(false);
});

it('keeps the editorial lower third inside the lower-third swap family', () => {
  expect(
    getCompatibleAnnotationTemplateKinds(VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL)
  ).toEqual(
    expect.arrayContaining([
      VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
      VideoOverlayTemplateKind.LOWER_THIRD_BADGE,
      VideoOverlayTemplateKind.LOWER_THIRD_BASIC,
      VideoOverlayTemplateKind.LOWER_THIRD_STACKED,
      VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER,
    ])
  );
});

it('keeps side reveal panels compatible with other scene reveal templates', () => {
  expect(getCompatibleAnnotationTemplateKinds(VideoOverlayTemplateKind.SIDE_REVEAL_PANEL)).toEqual(
    expect.arrayContaining([
      VideoOverlayTemplateKind.SHIMMER_LABEL,
      VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL,
      VideoOverlayTemplateKind.SCENE_PROGRESS_CARD,
      VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
    ])
  );
  expect(resolveAnnotationTemplateTraits(VideoOverlayTemplateKind.SIDE_REVEAL_PANEL)).toEqual({
    annotationFamily: 'TITLE',
    motionFamily: 'SLIDE_CARD',
    renderFamily: 'PLATE',
  });
});
