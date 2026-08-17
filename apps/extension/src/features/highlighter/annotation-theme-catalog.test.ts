import {
  SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS,
  type SystemAnnotationTemplateTagKey,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { expect, it } from 'vitest';
import { createSystemCalloutPresetCatalog } from './callout-presets/catalog';
import { createSystemBorderPresetCatalog } from './presets/catalog';
import { createSystemStepBadgePresetCatalog } from './step-badge-presets/catalog';
import { getSystemSurfaceStylePresets } from './surface-style/system-presets';
import { validateCalloutCustomCss } from './callout-custom-css';

const expectedThemeSizes: Record<SystemAnnotationTemplateTagKey, number> = {
  sniptale: 9,
  paper: 9,
  neon: 9,
  editorial: 9,
  retro80s: 9,
};

it('ships five closed three-combination themes with unique frame-derived defaults', () => {
  const borders = createSystemBorderPresetCatalog();
  const callouts = createSystemCalloutPresetCatalog();
  const steps = createSystemStepBadgePresetCatalog();
  const all = [...borders, ...callouts, ...steps];

  for (const [theme, tagId] of Object.entries(SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS)) {
    expect(all.filter((preset) => preset.tagIds.includes(tagId))).toHaveLength(
      expectedThemeSizes[theme as SystemAnnotationTemplateTagKey]
    );
  }

  for (const border of borders) {
    expect(border.tagIds).toHaveLength(1);
    const linked = border.effects?.linkedTemplates;
    const callout = callouts.find((preset) => preset.id === linked?.calloutPresetId);
    const step = steps.find((preset) => preset.id === linked?.stepBadgePresetId);
    expect(callout?.tagIds).toEqual(border.tagIds);
    expect(step?.tagIds).toEqual(border.tagIds);
  }

  expect(borders).toHaveLength(15);
  expect(callouts).toHaveLength(15);
  expect(steps).toHaveLength(15);
  expect(
    new Set(borders.map((preset) => preset.effects?.linkedTemplates?.calloutPresetId)).size
  ).toBe(15);
  expect(
    new Set(borders.map((preset) => preset.effects?.linkedTemplates?.stepBadgePresetId)).size
  ).toBe(15);

  for (const callout of callouts) {
    expect(validateCalloutCustomCss(callout.style.customCss), callout.id).toEqual({
      blockedProperties: [],
      error: null,
    });
    const bindings = Object.values(callout.style.colorBindings);
    expect(
      bindings.filter((source) => source === 'frame-border' || source === 'frame-fill').length
    ).toBeGreaterThanOrEqual(2);
  }
  for (const step of steps) {
    const style = step.settings.style;
    expect(style.backgroundColorSource).not.toBe('frame-fill');
    expect(
      style.sizeSource === 'frame-border' ||
        [style.textColorSource, style.outlineColorSource].some((source) =>
          ['frame-border', 'frame-fill'].includes(source)
        )
    ).toBe(true);
  }
});

it('orders every system template catalog in contiguous theme groups with Sniptale first', () => {
  const expectedTags = Object.values(SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS).flatMap((tagId) =>
    Array.from({ length: 3 }, () => tagId)
  );

  for (const catalog of [
    createSystemBorderPresetCatalog(),
    createSystemCalloutPresetCatalog(),
    createSystemStepBadgePresetCatalog(),
  ]) {
    expect(catalog.map((preset) => preset.tagIds[0])).toEqual(expectedTags);
    expect(catalog.map((preset) => preset.order)).toEqual(
      Array.from({ length: 15 }, (_, index) => index)
    );
  }
});

it('reuses canonical gradient and surface resources across the fifteen combinations', () => {
  const borders = createSystemBorderPresetCatalog();
  const callouts = createSystemCalloutPresetCatalog();
  const surfaces = getSystemSurfaceStylePresets();

  const reusedGradientIds = borders.map((preset) => {
    return preset.fillPaint.kind === 'gradient'
      ? preset.fillPaint.gradient.stops[0]!.id.replace(/-0$/u, '')
      : '';
  });
  expect(new Set(reusedGradientIds.filter(Boolean)).size).toBeGreaterThanOrEqual(6);

  const availableSurfacePaints = new Set(
    surfaces.map((preset) => JSON.stringify(preset.style.fillPaint))
  );
  expect(
    callouts.every((preset) =>
      availableSurfacePaints.has(JSON.stringify(preset.style.surface.fillPaint))
    )
  ).toBe(true);
  expect(
    new Set(callouts.map((preset) => JSON.stringify(preset.style.surface.fillPaint))).size
  ).toBe(12);
});

it('includes a full-feature flagship callout in every theme and varied connector treatments', () => {
  const callouts = createSystemCalloutPresetCatalog();
  for (const tagId of Object.values(SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS)) {
    const themed = callouts.filter((preset) => preset.tagIds.includes(tagId));
    expect(
      themed.some(
        ({ style }) =>
          style.title.enabled &&
          style.badge.enabled &&
          style.accentEdge.enabled &&
          style.connector.kind !== 'none' &&
          style.connector.frameMarker !== 'none' &&
          style.customCss.trim().length > 0
      )
    ).toBe(true);
  }
  expect(
    new Set(callouts.map((preset) => preset.style.connector.routing)).size
  ).toBeGreaterThanOrEqual(4);
  expect(
    new Set(callouts.map((preset) => preset.style.connector.frameMarker)).size
  ).toBeGreaterThanOrEqual(5);
  expect(
    new Set(callouts.map((preset) => preset.style.surface.radius)).size
  ).toBeGreaterThanOrEqual(6);
});

it('demonstrates separate Paint headings and a unified inner surface in every theme', () => {
  const callouts = createSystemCalloutPresetCatalog();
  for (const tagId of Object.values(SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS)) {
    expect(
      callouts.some(
        (preset) => preset.tagIds.includes(tagId) && preset.style.title.fillMode === 'unified'
      )
    ).toBe(true);
  }
  expect(
    callouts.some(
      (preset) =>
        preset.style.title.fillMode === 'separate' &&
        preset.style.title.fillPaint.kind === 'gradient'
    )
  ).toBe(true);
});

it('uses the opaque orange, dark, and white Sniptale combination as the fresh-user default', () => {
  const border = createSystemBorderPresetCatalog()[0]!;
  const callout = createSystemCalloutPresetCatalog()[0]!;
  const step = createSystemStepBadgePresetCatalog()[0]!;

  expect(border).toMatchObject({
    color: '#F97316',
    id: 'system-default',
    tagIds: [SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS.sniptale],
  });
  expect(border.effects?.linkedTemplates).toEqual({
    calloutPresetId: callout.id,
    stepBadgePresetId: step.id,
  });
  expect(callout.style).toMatchObject({
    accentEdge: { enabled: false },
    badge: { enabled: false, text: '' },
    connector: { kind: 'wedge' },
    surface: { fillPaint: { kind: 'solid', color: '#ffffffff' }, textColor: '#0F172A' },
    title: { enabled: false },
  });
  expect(step.settings.style).toMatchObject({
    backgroundColorSource: 'frame-border',
    textColor: '#ffffff',
    textColorSource: 'custom',
  });
});

it('keeps reviewed small text and translucent surfaces readable across host backgrounds', () => {
  const callouts = createSystemCalloutPresetCatalog();
  const borders = createSystemBorderPresetCatalog();
  const steps = createSystemStepBadgePresetCatalog();

  expect(
    callouts.find((preset) => preset.id === 'system-callout-bubble')?.style.badge.textColor
  ).toBe('#0F172A');
  expect(
    callouts.find((preset) => preset.id === 'system-callout-header-card')?.style
  ).toMatchObject({
    badge: { textColor: '#020617' },
    title: { textColor: '#020617' },
  });
  expect(callouts.find((preset) => preset.id === 'system-callout-text')?.style).toMatchObject({
    colorBindings: { surfaceBackground: 'custom' },
    surface: { fillPaint: { kind: 'gradient' }, textColor: '#0F172A' },
  });
  expect(
    callouts.find((preset) => preset.id === 'system-callout-editorial-proof')?.style.surface
      .fillPaint
  ).toMatchObject({ kind: 'gradient' });
  expect(
    borders
      .filter((preset) => preset.tagIds.includes(SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS.editorial))
      .map((preset) => preset.color)
  ).toEqual(['#737373', '#737373', '#737373']);
  expect(steps.find((preset) => preset.id === 'system-classic')?.settings.style.textColor).toBe(
    '#ffffff'
  );
  expect(steps.find((preset) => preset.id === 'system-large')?.settings.style.textColor).toBe(
    '#ffffff'
  );
});
