import { expect, it } from 'vitest';
import { createAnnotationClip } from './template';
import { resolveTemplateStyle } from './presentation';
import { createEmptyVideoProject } from '../factories/creation';
import { VideoOverlayTemplateKind } from '../types/index';

function createClip() {
  const project = createEmptyVideoProject('Style floors', 1280, 720);
  return createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 1);
}

it('applies template-specific style floors for core annotation variants', () => {
  const baseClip = createClip();
  const accentStyle = resolveTemplateStyle({
    ...baseClip,
    templateKind: VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
  });
  const stackedStyle = resolveTemplateStyle({
    ...baseClip,
    style: { ...baseClip.style, depthAmount: 0.1 },
    templateKind: VideoOverlayTemplateKind.LOWER_THIRD_STACKED,
  });
  const badgeStyle = resolveTemplateStyle({
    ...baseClip,
    style: { ...baseClip.style, shimmerAmount: 0.1 },
    templateKind: VideoOverlayTemplateKind.LOWER_THIRD_BADGE,
  });
  const titleStyle = resolveTemplateStyle({
    ...baseClip,
    templateKind: VideoOverlayTemplateKind.TITLE_REVEAL,
  });

  expect(accentStyle.borderRadius).toBe(24);
  expect(stackedStyle.depthAmount).toBeGreaterThanOrEqual(0.28);
  expect(badgeStyle.shimmerAmount).toBeGreaterThanOrEqual(0.44);
  expect(titleStyle.backgroundColor).toBeTruthy();
});

it('applies style floors for extended callout and spotlight templates', () => {
  const baseClip = createClip();

  expect(
    resolveTemplateStyle({
      ...baseClip,
      templateKind: VideoOverlayTemplateKind.CALLOUT_CARD,
    }).depthAmount
  ).toBeGreaterThanOrEqual(0.22);
  expect(
    resolveTemplateStyle({
      ...baseClip,
      templateKind: VideoOverlayTemplateKind.CALLOUT_CARD,
    }).blurAmount
  ).toBeGreaterThanOrEqual(0);
  expect(
    resolveTemplateStyle({
      ...baseClip,
      templateKind: VideoOverlayTemplateKind.POINTER_LABEL,
    }).blurAmount
  ).toBeGreaterThanOrEqual(0);
  expect(
    resolveTemplateStyle({
      ...baseClip,
      templateKind: VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD,
    }).depthAmount
  ).toBeGreaterThanOrEqual(0.36);
});

it('applies style floors for remaining shipped annotation template families', () => {
  const baseClip = createClip();

  expect(
    resolveTemplateStyle({
      ...baseClip,
      templateKind: VideoOverlayTemplateKind.SIDE_NOTE,
    }).borderRadius
  ).toBe(20);
  expect(
    resolveTemplateStyle({
      ...baseClip,
      templateKind: VideoOverlayTemplateKind.SECTION_DIVIDER,
    }).borderRadius
  ).toBe(999);
  expect(
    resolveTemplateStyle({
      ...baseClip,
      templateKind: VideoOverlayTemplateKind.SHIMMER_LABEL,
    }).shimmerAmount
  ).toBeGreaterThanOrEqual(0.62);
  expect(
    resolveTemplateStyle({
      ...baseClip,
      templateKind: VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
    }).depthAmount
  ).toBeGreaterThanOrEqual(0.44);
});
