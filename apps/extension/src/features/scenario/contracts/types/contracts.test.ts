import { expectTypeOf, it } from 'vitest';
import type { BlurSettings } from '@sniptale/ui/highlighter-style/types';
import type { ScenarioOverlay } from './overlays';
import type { ScenarioProject, ScenarioStep } from './project';

it('keeps scenario v2 project and overlay discriminants exact', () => {
  expectTypeOf<ScenarioProject['version']>().toEqualTypeOf<2>();
  expectTypeOf<ScenarioStep['kind']>().toEqualTypeOf<'capture' | 'section' | 'note' | 'divider'>();
  expectTypeOf<ScenarioOverlay['kind']>().toEqualTypeOf<
    | 'focus-rect'
    | 'click-ring'
    | 'cursor'
    | 'blur-rect'
    | 'arrow'
    | 'rectangle'
    | 'ellipse'
    | 'text'
  >();
  expectTypeOf<
    Extract<ScenarioOverlay, { kind: 'blur-rect' }>['blurSettings']
  >().toEqualTypeOf<BlurSettings>();
});
