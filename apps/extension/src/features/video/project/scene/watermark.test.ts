import { expect, it } from 'vitest';
import {
  createQuickEditWatermark,
  resetQuickEditWatermark,
  setQuickEditWatermarkMode,
  setQuickEditWatermarkAnchor,
  parseQuickEditWatermark,
  resolveQuickEditWatermarkBounds,
  resolveQuickEditWatermarkTile,
} from './watermark';
import {
  createQuickEditAdvancedState,
  createQuickEditAdvancedContent,
} from '../../review/advanced/defaults';
import {
  loadQuickEditAdvancedState,
  loadQuickEditAdvancedContentState,
} from '../../review/advanced/validation';

const logo = { assetId: 'project-asset:logo', width: 400, height: 200, size: 0.2, opacity: 0.7 };
it('starts off without adding authored content to old projects', () => {
  expect(createQuickEditAdvancedState().watermark).toBeUndefined();
  expect(createQuickEditWatermark('Made with Sniptale')).toMatchObject({
    mode: 'none',
    layout: 'single',
    text: { value: 'Made with Sniptale', size: 24 / 1080 },
    placement: { anchor: 'bottom-right', margin: 0.02 },
  });
});

it('seeds text once and retains the same logo and typography across mode switches', () => {
  const first = setQuickEditWatermarkMode(undefined, 'text', 'Сделано в Sniptale');
  const authored = {
    ...first,
    image: logo,
    text: { ...first.text, value: 'Автор\n© 2026', font: 'serif' as const },
  };
  const off = setQuickEditWatermarkMode(authored, 'none', 'Made with Sniptale');
  const image = setQuickEditWatermarkMode(off, 'image', 'Made with Sniptale');
  expect(setQuickEditWatermarkMode(image, 'text', 'Made with Sniptale')).toEqual(authored);
  expect(off.image).toEqual(logo);
  expect(createQuickEditWatermark('Made with Sniptale').image).toBeUndefined();
});

it('parses active and remembered images identically and has a fixed point', () => {
  for (const mode of ['none', 'text', 'image'] as const) {
    const watermark = { ...createQuickEditWatermark('Текст\nLatin'), mode, image: logo };
    expect(parseQuickEditWatermark(watermark)).toEqual(watermark);
    const parsed = loadQuickEditAdvancedState({ ...createQuickEditAdvancedState(), watermark });
    expect(parsed?.watermark).toEqual(watermark);
    expect(loadQuickEditAdvancedState(parsed)).toEqual(parsed);
    expect(
      loadQuickEditAdvancedContentState({ ...createQuickEditAdvancedContent(), watermark })
        ?.watermark
    ).toEqual(watermark);
  }
});

it('preserves Unicode, empty and multiline text without trimming or truncating', () => {
  for (const value of ['', '  Автор  ', '🙂'.repeat(200), 'First\nВторая\n第三']) {
    const watermark = createQuickEditWatermark(value);
    expect(parseQuickEditWatermark(watermark)?.text.value).toBe(value);
  }
  for (const value of ['a'.repeat(201), '1\n2\n3\n4', '\ud800', 'a\u0000b', 'a\rb']) {
    const watermark = {
      ...createQuickEditWatermark('valid'),
      text: { ...createQuickEditWatermark('valid').text, value },
    };
    expect(parseQuickEditWatermark(watermark)).toBeNull();
    expect(loadQuickEditAdvancedState({ ...createQuickEditAdvancedState(), watermark })).toBeNull();
  }
});

it('rejects malformed settings and refuses external or runtime image locators', () => {
  const base = createQuickEditWatermark('Text');
  const invalid: unknown[] = [
    { ...base, mode: 'video' },
    { ...base, layout: 'animated' },
    { ...base, text: { ...base.text, font: 'remote' } },
    { ...base, text: { ...base.text, color: 'url(https://evil.test)' } },
    { ...base, text: { ...base.text, size: Number.NaN } },
    { ...base, text: { ...base.text, opacity: 0.2 } },
    { ...base, image: { ...logo, assetId: 'https://evil.test/logo.png' } },
    { ...base, image: { ...logo, width: 4096, height: 4096 } },
    { ...base, image: { ...logo, width: 1.5 } },
    { ...base, image: { ...logo, opacity: 1.1 } },
    { ...base, image: { ...logo, url: 'blob:temporary' } },
    { ...base, placement: { ...base.placement, position: { x: -0.1, y: 0.5 } } },
    { ...base, tile: { ...base.tile, spacing: -1 } },
    { ...base, tile: { ...base.tile, rotation: Number.POSITIVE_INFINITY } },
  ];
  for (const value of invalid) expect(parseQuickEditWatermark(value)).toBeNull();
});

it.each([
  { width: 1920, height: 1080 },
  { width: 1080, height: 1920 },
  { width: 600, height: 600 },
  { width: 160, height: 90 },
  { width: 3840, height: 2160 },
])('keeps all anchors and oversized painted bounds inside $width × $height', (canvas) => {
  const base = createQuickEditWatermark('Text');
  const anchors = [
    'top-left',
    'top',
    'top-right',
    'left',
    'center',
    'right',
    'bottom-left',
    'bottom',
    'bottom-right',
  ] as const;
  for (const anchor of anchors) {
    const settings = setQuickEditWatermarkAnchor(base, anchor);
    for (const painted of [
      { width: 100, height: 30 },
      { width: 6000, height: 4000 },
    ]) {
      const rect = resolveQuickEditWatermarkBounds(settings, canvas, painted);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(canvas.width + 1e-8);
      expect(rect.y + rect.height).toBeLessThanOrEqual(canvas.height + 1e-8);
      expect(rect.width / rect.height).toBeCloseTo(painted.width / painted.height);
      expect(settings.placement.anchor).toBe(anchor);
    }
  }
});

it('uses normalized custom centers and clears them when an anchor is chosen', () => {
  const base = createQuickEditWatermark('Text');
  const custom = { ...base, placement: { ...base.placement, position: { x: 0, y: 1 } } };
  expect(
    resolveQuickEditWatermarkBounds(
      custom,
      { width: 1000, height: 500 },
      { width: 100, height: 40 }
    )
  ).toEqual({ x: 10, y: 450, width: 100, height: 40, scale: 1 });
  const reset = setQuickEditWatermarkAnchor(custom, 'center');
  expect(reset.placement.position).toBeUndefined();
  expect(
    resolveQuickEditWatermarkBounds(reset, { width: 1000, height: 500 }, { width: 100, height: 40 })
  ).toEqual({ x: 450, y: 230, width: 100, height: 40, scale: 1 });
});

it('spaces rotated painted tiles with a positive gap and rejects excessive instance budgets', () => {
  const base = createQuickEditWatermark('Text');
  const settings = { ...base, layout: 'tiled' as const, tile: { spacing: 0, rotation: 45 } };
  const tile = resolveQuickEditWatermarkTile(
    settings,
    { width: 1920, height: 1080 },
    { width: 120, height: 40 }
  );
  expect(tile.width).toBeCloseTo(Math.sqrt(0.5) * 160);
  expect(tile.stepX).toBeGreaterThan(tile.width);
  expect(tile.stepY).toBeGreaterThan(tile.height);
  expect(tile.count).toBe(tile.columns * tile.rows);
  expect(tile.count).toBeLessThanOrEqual(4096);
  expect(() =>
    resolveQuickEditWatermarkTile(settings, { width: 3840, height: 2160 }, { width: 1, height: 1 })
  ).toThrow();
  expect(() =>
    resolveQuickEditWatermarkBounds(settings, { width: 0, height: 1080 }, { width: 1, height: 1 })
  ).toThrow();
});

it('roundtrips strikethrough and remembered scene paint without changing legacy omission', () => {
  const state = createQuickEditAdvancedState();
  const legacy = { ...state, schemaVersion: 9, watermark: createQuickEditWatermark('Saved') };
  expect(loadQuickEditAdvancedState(legacy)?.watermark?.text).not.toHaveProperty('strike');
  const settings = { ...legacy.watermark, text: { ...legacy.watermark.text, strike: true } };
  const background = {
    enabled: false,
    rememberedPaint: { kind: 'solid', color: '#123456ff' },
    rememberedLayout: { padding: 91, cornerRadius: 17, blur: 6 },
  };
  const loaded = loadQuickEditAdvancedState({ ...state, watermark: settings, background });
  expect(loaded?.watermark).toEqual(settings);
  expect(loaded?.background).toEqual(background);
  expect(loadQuickEditAdvancedState(JSON.parse(JSON.stringify(loaded)))).toEqual(loaded);
  expect(
    parseQuickEditWatermark({ ...settings, text: { ...settings.text, strike: 'true' } })
  ).toBeNull();
  expect(
    loadQuickEditAdvancedState({ ...state, background: { ...background, rememberedPaint: {} } })
  ).toBeNull();
});

it('retains italic across canonical parsing and rejects nonboolean typography', () => {
  const base = createQuickEditWatermark('Text');
  const italic = { ...base, text: { ...base.text, italic: true } };
  expect(parseQuickEditWatermark(italic)).toEqual(italic);
  expect(
    loadQuickEditAdvancedContentState({ ...createQuickEditAdvancedContent(), watermark: italic })
      ?.watermark
  ).toEqual(italic);
  expect(parseQuickEditWatermark({ ...base, text: { ...base.text, italic: 'true' } })).toBeNull();
});
it('resets image presentation defaults while preserving its bytes and authored text', () => {
  const base = { ...createQuickEditWatermark('Author'), mode: 'image' as const, image: logo };
  const reset = resetQuickEditWatermark(base, 'Localized seed');
  expect(reset.mode).toBe('image');
  expect(reset.image).toEqual({ ...logo, size: 0.2, opacity: 1 });
  expect(reset.text).toEqual(base.text);
});
