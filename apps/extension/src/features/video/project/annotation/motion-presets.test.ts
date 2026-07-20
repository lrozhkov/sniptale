import { expect, it } from 'vitest';
import { resolveAnnotationPartDelays, resolveAnnotationRevealProfile } from './motion-presets';
import { VideoOverlayTemplateKind } from '../types/index';

it('resolves staged part delays and reveal profiles for every annotation template', () => {
  for (const templateKind of Object.values(VideoOverlayTemplateKind)) {
    const delays = resolveAnnotationPartDelays(templateKind);
    const profile = resolveAnnotationRevealProfile(templateKind);

    expect(delays.accent).toBeGreaterThanOrEqual(0);
    expect(delays.badge).toBeGreaterThanOrEqual(0);
    expect(delays.headline).toBeGreaterThanOrEqual(0);
    expect(delays.subline).toBeGreaterThanOrEqual(0);
    expect(profile.accentWidthFrom).toBeGreaterThanOrEqual(0);
    expect(profile.headlineRevealDelay).toBeGreaterThanOrEqual(0);
    expect(profile.sublineRevealDelay).toBeGreaterThanOrEqual(0);
  }
});

it('keeps new annotation examples on distinct staged reveal timings', () => {
  const tickerDelays = resolveAnnotationPartDelays(
    VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER
  );
  const cursorProfile = resolveAnnotationRevealProfile(
    VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL
  );
  const progressProfile = resolveAnnotationRevealProfile(
    VideoOverlayTemplateKind.SCENE_PROGRESS_CARD
  );

  expect(tickerDelays.accent).toBeLessThan(tickerDelays.subline);
  expect(cursorProfile.headlineRevealDelay).toBeGreaterThan(progressProfile.headlineRevealDelay);
});

it('keeps target-aware notification and scan examples on non-static motion profiles', () => {
  const notificationDelays = resolveAnnotationPartDelays(
    VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER
  );
  const scanProfile = resolveAnnotationRevealProfile(VideoOverlayTemplateKind.FOCUS_SCAN_FRAME);

  expect(notificationDelays.headline).toBeLessThan(notificationDelays.subline);
  expect(scanProfile.accentWidthFrom).toBeLessThan(1);
});
