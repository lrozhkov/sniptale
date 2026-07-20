import { expect, it } from 'vitest';
import { resolveAnnotationSurfaceProfile } from './surface-profile';
import { VideoOverlayTemplateKind } from '../types/index';

it('resolves surface profiles for every shipped annotation template', () => {
  for (const templateKind of Object.values(VideoOverlayTemplateKind)) {
    const profile = resolveAnnotationSurfaceProfile(templateKind);

    expect(profile.borderAlpha).toBeGreaterThanOrEqual(0);
    if (profile.gradientAxis === null) {
      expect(profile.gradientStart).toBeNull();
      expect(profile.gradientEnd).toBeNull();
      continue;
    }

    expect(profile.gradientStart).toContain('rgba(');
    expect(profile.gradientEnd).toContain('rgba(');
  }
});

it('gives spotlight and 3d cards richer surface treatment than basic lower thirds', () => {
  const basic = resolveAnnotationSurfaceProfile(VideoOverlayTemplateKind.LOWER_THIRD_BASIC);
  const editorial = resolveAnnotationSurfaceProfile(VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL);
  const spotlight = resolveAnnotationSurfaceProfile(
    VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD
  );
  const reveal = resolveAnnotationSurfaceProfile(VideoOverlayTemplateKind.THREE_D_REVEAL_CARD);

  expect(editorial.gradientAxis).toBe('horizontal');
  expect(editorial.borderAlpha).toBeGreaterThan(basic.borderAlpha);
  expect(editorial.highlightAlpha).toBeGreaterThan(basic.highlightAlpha);
  expect(spotlight.gradientAxis).toBe('diagonal');
  expect(spotlight.borderAlpha).toBeGreaterThan(basic.borderAlpha);
  expect(reveal.accentGlowAlpha).toBeGreaterThan(basic.accentGlowAlpha);
  expect(reveal.gradientStart).not.toBe(basic.gradientStart);
});

it('gives side reveal panels a dark cinematic horizontal surface', () => {
  const profile = resolveAnnotationSurfaceProfile(VideoOverlayTemplateKind.SIDE_REVEAL_PANEL);

  expect(profile.gradientAxis).toBe('horizontal');
  expect(profile.borderAlpha).toBeGreaterThan(0);
  expect(profile.gradientStart).toContain('rgba(255,255,255,0.12)');
});
