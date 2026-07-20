import { expect, expectTypeOf, it } from 'vitest';

import {
  SCENARIO_PRESENTATION_THEMES,
  SCENARIO_SLIDE_LAYOUTS,
  SCENARIO_TEMPLATE_CATALOG_STATUS,
} from '.';
import type { ScenarioProjectV3, ScenarioSlideSource, ScenarioTemplateDefinition } from '.';

it('keeps scenario v3 project and source contracts versioned and discriminated', () => {
  expectTypeOf<ScenarioProjectV3['version']>().toEqualTypeOf<3>();
  expectTypeOf<Extract<ScenarioSlideSource, { kind: 'manual' }>>().toEqualTypeOf<{
    kind: 'manual';
  }>();
  expectTypeOf<Extract<ScenarioSlideSource, { kind: 'unknown' }>>().toEqualTypeOf<never>();
  expectTypeOf<ScenarioTemplateDefinition['source']>().toEqualTypeOf<'bundled' | 'imported'>();
});

it('exposes canonical presentation and template vocabularies', () => {
  expect(Object.values(SCENARIO_PRESENTATION_THEMES)).toEqual([
    'editorial-warm',
    'graphite',
    'studio-light',
  ]);
  expect(SCENARIO_SLIDE_LAYOUTS.screenshotCallout).toBe('screenshot-callout');
  expect(Object.values(SCENARIO_TEMPLATE_CATALOG_STATUS)).toEqual(['core', 'disabled', 'optional']);
});
