import {
  DEFAULT_WINDOW_HEADER,
  windowHeaderGeometry,
} from '@sniptale/runtime-contracts/window-header';
import { maximumMediaPadding, resolveMediaPaddingLayout } from './framing-presets';
import { getFittedMediaWindowFrame } from '../../composition/draw/fitted-media';
import { expect, it } from 'vitest';
import { getMediaFramingPresets } from './framing-presets';

it.each([
  [1920, 1080, 1920, 1080],
  [1920, 1080, 1080, 1920],
  [1080, 1920, 1920, 1080],
  [1920, 1080, 1080, 1080],
])('centers proportional presets for %s×%s on %s×%s', (sw, sh, cw, ch) => {
  const presets = getMediaFramingPresets(sw, sh, cw, ch);
  expect(presets).toHaveLength(3);
  for (const { transform: t } of presets) {
    expect(t.width / t.height).toBeCloseTo(sw / sh);
    expect(Math.abs(t.x + t.width / 2 - cw / 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(t.y + t.height / 2 - ch / 2)).toBeLessThanOrEqual(0.5);
  }
  const inset = presets[1]!.transform;
  expect(inset.x).toBeGreaterThan(0);
  expect(inset.y).toBeGreaterThan(0);
  const fill = presets[2]!.transform;
  expect(fill.width).toBeGreaterThanOrEqual(cw);
  expect(fill.height).toBeGreaterThanOrEqual(ch);
});

it('uses smaller decorative margins for mismatched aspect ratios and scales with the canvas', () => {
  const matching = getMediaFramingPresets(1920, 1080, 1920, 1080)[1]!;
  const portrait = getMediaFramingPresets(1920, 1080, 1080, 1920)[1]!;
  expect(portrait.fitScalePercent).toBeGreaterThan(matching.fitScalePercent);
  const hd = getMediaFramingPresets(1920, 1080, 1280, 720)[1]!;
  expect(hd.fitScalePercent).toBe(matching.fitScalePercent);
  expect(Math.abs(hd.transform.width - (matching.transform.width * 2) / 3)).toBeLessThanOrEqual(1);
  expect(getMediaFramingPresets(0, 1080, 1920, 1080)).toEqual([]);
});

it('framing previews and resulting decorated window agree after crop and header fitting', () => {
  for (const preset of getMediaFramingPresets(80, 90, 320, 180, DEFAULT_WINDOW_HEADER, {
    width: 160,
    height: 90,
  })) {
    const frame = getFittedMediaWindowFrame({
      frame: preset.transform,
      fitMode: preset.fitMode,
      sourceWidth: 160,
      sourceHeight: 90,
      sourceCrop: { x: 0.25, y: 0, width: 0.5, height: 1 },
      windowHeader: DEFAULT_WINDOW_HEADER,
    });
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(Math.abs(frame[key] - preset.transform[key])).toBeLessThanOrEqual(1);
  }
});

it.each([0, 12.25, 40, 89.5])(
  'fits padding %s exactly while preserving video proportions and logical header rows',
  (padding) => {
    const layout = resolveMediaPaddingLayout(80, 90, 320, 180, padding, DEFAULT_WINDOW_HEADER)!;
    const header = windowHeaderGeometry(DEFAULT_WINDOW_HEADER, { width: 80, height: 90 }).height;
    const actualHeader = layout.transform.height - (layout.transform.width * 90) / 80;
    expect(actualHeader).toBeGreaterThan(0);
    if (layout.transform.height > 2) {
      expect(actualHeader).toBeCloseTo(
        Math.ceil((header * layout.transform.width) / 80 / 2) * 2,
        10
      );
    }
    const visible = getFittedMediaWindowFrame({
      frame: layout.transform,
      sourceWidth: 80,
      sourceHeight: 90,
      windowHeader: DEFAULT_WINDOW_HEADER,
      fitMode: layout.fitMode,
    });
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(visible[key]).toBeCloseTo(layout.transform[key], 10);
    expect(layout.transform.x + layout.transform.width / 2).toBeCloseTo(160, 10);
    expect(layout.transform.y + layout.transform.height / 2).toBeCloseTo(90, 10);
    expect(
      Math.min(
        layout.transform.x,
        layout.transform.y,
        320 - layout.transform.x - layout.transform.width,
        180 - layout.transform.y - layout.transform.height
      )
    ).toBeCloseTo(padding, 10);
    expect(layout.fitScalePercent).toBeGreaterThanOrEqual(1);
    expect(layout.fitScalePercent).toBeLessThanOrEqual(100);
  }
);

it('refuses impossible padding and invalid dimensions without manufacturing a different requested inset', () => {
  expect(maximumMediaPadding(320, 180)).toBe(89.5);
  expect(maximumMediaPadding(1, 1)).toBe(0);
  for (const padding of [-1, 90, 4096, NaN, Infinity])
    expect(resolveMediaPaddingLayout(80, 90, 320, 180, padding)).toBeNull();
  for (const dimensions of [
    [0, 90, 320, 180],
    [80, NaN, 320, 180],
    [80, 90, 0, 180],
    [80, 90, 320, Infinity],
  ])
    expect(
      resolveMediaPaddingLayout(dimensions[0]!, dimensions[1]!, dimensions[2]!, dimensions[3]!, 0)
    ).toBeNull();
});

it('matches Gallery framing and records its distinct header output policy', async () => {
  const { computeQuickEditSceneLayout, computeQuickEditSceneSize } =
    await import('../../review/advanced/scene');
  const base = {
    source: { width: 160, height: 90 },
    canvas: { width: 160, height: 180, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } },
    background: {
      enabled: true as const,
      type: 'solid' as const,
      color: '#123456',
      layout: { padding: 30, cornerRadius: 0 },
    },
  };
  const camera = { scale: 1, centerX: 0.5, centerY: 0.5 };
  const size = computeQuickEditSceneSize(base);
  const gallery = computeQuickEditSceneLayout({ ...base, camera, output: size });
  const montage = resolveMediaPaddingLayout(80, 90, size.width, size.height, 30)!;
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(montage.transform[key]).toBeCloseTo(gallery.windowRect[key], 10);
  const decorated = { ...base, windowHeader: DEFAULT_WINDOW_HEADER };
  const decoratedSize = computeQuickEditSceneSize(decorated);
  const galleryHeader = computeQuickEditSceneLayout({
    ...decorated,
    camera,
    output: decoratedSize,
  });
  const montageHeader = resolveMediaPaddingLayout(
    80,
    90,
    decoratedSize.width,
    decoratedSize.height,
    30,
    DEFAULT_WINDOW_HEADER
  )!;
  expect(decoratedSize.height).toBeGreaterThan(size.height);
  expect(galleryHeader.windowRect.height).not.toBeCloseTo(montageHeader.transform.height, 2);
  // The later converter must adapt extra-output headers; equal padding alone does not copy this scene.
  expect(galleryHeader.videoRect.height).toBeCloseTo(gallery.videoRect.height, 10);
});
