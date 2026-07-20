import { expect, expectTypeOf, it } from 'vitest';

import { SCENARIO_V3_ELEMENT_KINDS } from '.';
import type { ScenarioElement, ScenarioElementPatch } from '.';

it('keeps every scenario v3 element kind represented exactly once', () => {
  expect(Object.values(SCENARIO_V3_ELEMENT_KINDS)).toEqual([
    'arrow',
    'callout',
    'code',
    'image',
    'line',
    'shape',
    'text',
  ]);
  expectTypeOf<ScenarioElement['kind']>().toEqualTypeOf<
    'arrow' | 'callout' | 'code' | 'image' | 'line' | 'shape' | 'text'
  >();
  expectTypeOf<Extract<ScenarioElement, { kind: 'callout' }>>().toMatchTypeOf<{
    connector: { start: { x: number; y: number }; end: { x: number; y: number } } | null;
    text: string;
  }>();
  expectTypeOf<Extract<ScenarioElement, { kind: 'unknown' }>>().toEqualTypeOf<never>();
  expectTypeOf<ScenarioElementPatch>().toMatchTypeOf<{ opacity?: number }>();
});
