import { expect, it } from 'vitest';
import { resolveAnnotationSweepProfile } from './sweep-profile';
import { VideoOverlayTemplateKind } from '../types/index';

it('resolves narrower shimmer profiles for label-like templates', () => {
  const labelProfile = resolveAnnotationSweepProfile(
    VideoOverlayTemplateKind.SHIMMER_LABEL,
    'shimmer'
  );
  const badgeProfile = resolveAnnotationSweepProfile(
    VideoOverlayTemplateKind.LOWER_THIRD_BADGE,
    'shimmer'
  );

  expect(labelProfile.widthPercent).toBeLessThan(badgeProfile.widthPercent);
  expect(labelProfile.peakAlpha).toBeGreaterThan(badgeProfile.edgeAlpha);
});

it('resolves richer gloss profiles for 3d and spotlight templates', () => {
  const baseProfile = resolveAnnotationSweepProfile(
    VideoOverlayTemplateKind.LOWER_THIRD_BASIC,
    'gloss'
  );
  const editorialProfile = resolveAnnotationSweepProfile(
    VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL,
    'gloss'
  );
  const revealProfile = resolveAnnotationSweepProfile(
    VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
    'gloss'
  );
  const spotlightProfile = resolveAnnotationSweepProfile(
    VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD,
    'gloss'
  );

  expect(editorialProfile.widthPercent).toBeLessThan(baseProfile.widthPercent);
  expect(editorialProfile.peakAlpha).toBeLessThanOrEqual(baseProfile.peakAlpha);
  expect(revealProfile.widthPercent).toBeGreaterThan(baseProfile.widthPercent);
  expect(revealProfile.tintRgb).not.toBe(baseProfile.tintRgb);
  expect(spotlightProfile.peakAlpha).toBeGreaterThan(baseProfile.peakAlpha);
});

it('resolves valid shimmer and gloss profiles for every shipped annotation template', () => {
  for (const templateKind of Object.values(VideoOverlayTemplateKind)) {
    const shimmerProfile = resolveAnnotationSweepProfile(templateKind, 'shimmer');
    const glossProfile = resolveAnnotationSweepProfile(templateKind, 'gloss');

    expect(shimmerProfile.widthPercent).toBeGreaterThan(0);
    expect(shimmerProfile.travelPercent).toBeGreaterThan(100);
    expect(glossProfile.widthPercent).toBeGreaterThan(0);
    expect(glossProfile.travelPercent).toBeGreaterThan(100);
  }
});

it('keeps side reveal panel sweep understated compared with 3d reveal cards', () => {
  const sidePanelGloss = resolveAnnotationSweepProfile(
    VideoOverlayTemplateKind.SIDE_REVEAL_PANEL,
    'gloss'
  );
  const revealGloss = resolveAnnotationSweepProfile(
    VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
    'gloss'
  );

  expect(sidePanelGloss.widthPercent).toBeLessThan(revealGloss.widthPercent);
  expect(sidePanelGloss.peakAlpha).toBeLessThan(revealGloss.peakAlpha);
});
