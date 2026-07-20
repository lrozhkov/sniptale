import { expect, it } from 'vitest';
import { resolveAnnotationLayoutFeatures, VideoAnnotationLayoutFamily } from './layout';
import { VideoOverlayTemplateKind } from '../types/index';

it('maps card, pill, and title templates to the expected layout families', () => {
  expect(resolveAnnotationLayoutFeatures(VideoOverlayTemplateKind.LOWER_THIRD_BASIC)).toEqual(
    expect.objectContaining({
      family: VideoAnnotationLayoutFamily.RAIL_CARD,
      showAccentRail: true,
      showSubline: true,
    })
  );
  expect(resolveAnnotationLayoutFeatures(VideoOverlayTemplateKind.SHIMMER_LABEL)).toEqual(
    expect.objectContaining({
      family: VideoAnnotationLayoutFamily.PILL_LABEL,
      showAccentRail: false,
      showSubline: false,
    })
  );
  expect(resolveAnnotationLayoutFeatures(VideoOverlayTemplateKind.SECTION_DIVIDER)).toEqual(
    expect.objectContaining({
      family: VideoAnnotationLayoutFamily.TITLE_STACK,
      showDivider: true,
      textAlign: 'center',
    })
  );
});

it('maps target-aware templates to the expected layout families', () => {
  expect(resolveAnnotationLayoutFeatures(VideoOverlayTemplateKind.CALLOUT_CONNECTOR)).toEqual(
    expect.objectContaining({
      family: VideoAnnotationLayoutFamily.CONNECTOR,
      showSubline: true,
      textAlign: 'left',
    })
  );
  expect(resolveAnnotationLayoutFeatures(VideoOverlayTemplateKind.CALLOUT_CARD)).toEqual(
    expect.objectContaining({
      family: VideoAnnotationLayoutFamily.FRAME,
      showSubline: true,
      textAlign: 'left',
    })
  );
  expect(resolveAnnotationLayoutFeatures(VideoOverlayTemplateKind.POINTER_LABEL)).toEqual(
    expect.objectContaining({
      family: VideoAnnotationLayoutFamily.MARKER,
      showSubline: false,
      textAlign: 'left',
    })
  );
  expect(resolveAnnotationLayoutFeatures(VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD)).toEqual(
    expect.objectContaining({
      family: VideoAnnotationLayoutFamily.FRAME,
      showSubline: true,
      textAlign: 'left',
    })
  );
  expect(resolveAnnotationLayoutFeatures(VideoOverlayTemplateKind.FOCUS_SCAN_FRAME)).toEqual(
    expect.objectContaining({
      family: VideoAnnotationLayoutFamily.FRAME,
      showSubline: true,
      textAlign: 'left',
    })
  );
});

it('covers every shipped overlay template family through the shared registry-backed layout resolver', () => {
  expect(
    [
      VideoOverlayTemplateKind.LOWER_THIRD_BASIC,
      VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
      VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL,
      VideoOverlayTemplateKind.LOWER_THIRD_STACKED,
      VideoOverlayTemplateKind.LOWER_THIRD_BADGE,
      VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER,
      VideoOverlayTemplateKind.CALLOUT_CARD,
      VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
      VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER,
      VideoOverlayTemplateKind.POINTER_LABEL,
      VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD,
      VideoOverlayTemplateKind.FOCUS_SCAN_FRAME,
      VideoOverlayTemplateKind.SIDE_NOTE,
      VideoOverlayTemplateKind.TITLE_REVEAL,
      VideoOverlayTemplateKind.SECTION_DIVIDER,
      VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL,
      VideoOverlayTemplateKind.SHIMMER_LABEL,
      VideoOverlayTemplateKind.SIDE_REVEAL_PANEL,
      VideoOverlayTemplateKind.SCENE_PROGRESS_CARD,
      VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
    ].map((templateKind) => resolveAnnotationLayoutFeatures(templateKind).family)
  ).toEqual([
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationLayoutFamily.FRAME,
    VideoAnnotationLayoutFamily.CONNECTOR,
    VideoAnnotationLayoutFamily.FRAME,
    VideoAnnotationLayoutFamily.MARKER,
    VideoAnnotationLayoutFamily.FRAME,
    VideoAnnotationLayoutFamily.FRAME,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationLayoutFamily.TITLE_STACK,
    VideoAnnotationLayoutFamily.TITLE_STACK,
    VideoAnnotationLayoutFamily.TITLE_STACK,
    VideoAnnotationLayoutFamily.PILL_LABEL,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
  ]);
});

it('keeps the layout facade aligned with shared template capability controls', () => {
  expect(resolveAnnotationLayoutFeatures(VideoOverlayTemplateKind.CALLOUT_CONNECTOR)).toEqual(
    expect.objectContaining({
      family: VideoAnnotationLayoutFamily.CONNECTOR,
      showAccentRail: false,
      showBadge: false,
      showSubline: true,
    })
  );
});
