import { expectTypeOf, it } from 'vitest';
import type { BlurSettings } from '@sniptale/ui/highlighter-style/types';
import type { ScenarioOverlay } from './overlays';
import type { GuideProject, GuideBlock } from '@sniptale/runtime-contracts/scenario/types/guide';

it('keeps guide project and overlay discriminants exact', () => {
  expectTypeOf<GuideProject['version']>().toEqualTypeOf<4>();
  expectTypeOf<GuideBlock['kind']>().toEqualTypeOf<
    'heading' | 'text' | 'note' | 'image' | 'image-slot'
  >();
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
