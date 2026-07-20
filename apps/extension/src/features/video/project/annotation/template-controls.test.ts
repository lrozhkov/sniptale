import { expect, it } from 'vitest';
import { resolveAnnotationTemplateControls } from './template-controls';
import { VideoOverlayTemplateKind } from '../types/index';

it('resolves shared overlay capability controls for target-aware templates', () => {
  expect(resolveAnnotationTemplateControls(VideoOverlayTemplateKind.CALLOUT_CARD)).toEqual(
    expect.objectContaining({
      layoutFamily: 'FRAME',
      showBadge: false,
      showSubline: true,
      supportsTarget: true,
    })
  );
  expect(resolveAnnotationTemplateControls(VideoOverlayTemplateKind.CALLOUT_CONNECTOR)).toEqual(
    expect.objectContaining({
      showAccentColor: true,
      showBackgroundColor: true,
      showBadge: false,
      showBadgeTextColor: false,
      showDirection: true,
      showIntensity: true,
      showSubline: true,
      showSublineColor: true,
      supportsArrowKind: true,
      supportsLeaderLineStyle: true,
      supportsLeaderLineThickness: true,
      supportsMarkerKind: true,
      supportsTarget: true,
    })
  );
  expect(resolveAnnotationTemplateControls(VideoOverlayTemplateKind.POINTER_LABEL)).toEqual(
    expect.objectContaining({
      layoutFamily: 'MARKER',
      showBadgeTextColor: false,
      showSubline: false,
      showSublineColor: false,
      supportsTarget: true,
    })
  );
  expect(
    resolveAnnotationTemplateControls(VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD)
  ).toEqual(
    expect.objectContaining({
      layoutFamily: 'FRAME',
      showBadge: false,
      showSubline: true,
      supportsTarget: true,
    })
  );
});

it('keeps non-target templates on the card/title capability path', () => {
  expect(resolveAnnotationTemplateControls(VideoOverlayTemplateKind.LOWER_THIRD_BASIC)).toEqual(
    expect.objectContaining({
      layoutFamily: 'RAIL_CARD',
      showAccentRail: true,
      showBadge: true,
      showBadgeTextColor: true,
      supportsTarget: false,
    })
  );
  expect(resolveAnnotationTemplateControls(VideoOverlayTemplateKind.SECTION_DIVIDER)).toEqual(
    expect.objectContaining({
      showDivider: true,
      showSubline: false,
      showSublineColor: false,
      textAlign: 'center',
    })
  );
});
