import { expect, it } from 'vitest';
import { createAnnotationClip } from './template';
import { createEmptyVideoProject } from '../factories/creation';
import { resolveAnnotationIdleMotion } from './idle-motion';
import { VideoOverlayTemplateKind } from '../types/index';

function createClip(templateKind: VideoOverlayTemplateKind) {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    1,
    templateKind
  );
  clip.duration = 4;
  clip.introDurationMs = 400;
  clip.outroDurationMs = 400;
  return clip;
}

it('enables idle shimmer and gloss only inside the steady-state hold window', () => {
  const shimmerClip = createClip(VideoOverlayTemplateKind.SHIMMER_LABEL);
  const beforeHold = resolveAnnotationIdleMotion(shimmerClip, 1.2);
  const steady = resolveAnnotationIdleMotion(shimmerClip, 2.1);
  const outro = resolveAnnotationIdleMotion(shimmerClip, 4.75);

  expect(beforeHold.shimmerProgress).toBeNull();
  expect(steady.shimmerProgress).not.toBeNull();
  expect(steady.translateY).not.toBe(0);
  expect(outro.shimmerProgress).toBeNull();
});

it('applies float, scale, and gloss idle motion to 3d reveal cards', () => {
  const clip = createClip(VideoOverlayTemplateKind.THREE_D_REVEAL_CARD);
  const steady = resolveAnnotationIdleMotion(clip, 2.35);

  expect(steady.glossProgress).not.toBeNull();
  expect(steady.scaleMultiplier).not.toBe(1);
  expect(steady.shadowStrength).not.toBe(1);
  expect(steady.translateY).not.toBe(0);
});

it('applies shimmer idle motion to newly added annotation examples', () => {
  const statusClip = createClip(VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER);
  const cursorClip = createClip(VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL);
  const scanClip = createClip(VideoOverlayTemplateKind.FOCUS_SCAN_FRAME);

  expect(resolveAnnotationIdleMotion(statusClip, 2.2).shimmerProgress).not.toBeNull();
  expect(resolveAnnotationIdleMotion(cursorClip, 2.2).shimmerProgress).not.toBeNull();
  expect(resolveAnnotationIdleMotion(scanClip, 2.2).glossProgress).not.toBeNull();
});

it('keeps basic lower thirds static outside shipped idle families', () => {
  const clip = createClip(VideoOverlayTemplateKind.LOWER_THIRD_BASIC);

  expect(resolveAnnotationIdleMotion(clip, 2)).toEqual({
    glossProgress: null,
    scaleMultiplier: 1,
    shadowStrength: 1,
    shimmerProgress: null,
    translateY: 0,
  });
});
