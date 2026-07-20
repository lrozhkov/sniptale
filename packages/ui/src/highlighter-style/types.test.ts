import { expectTypeOf, it } from 'vitest';
import type { BlurSettings, BlurStrokeStyle, BorderPreset, EffectMode } from './types';

it('keeps highlighter style variants and preset references narrow', () => {
  expectTypeOf<EffectMode>().toEqualTypeOf<'border' | 'blur' | 'focus'>();
  expectTypeOf<BlurStrokeStyle>().toEqualTypeOf<
    BorderPreset['style'] | 'dash' | 'dot' | 'dash-dot' | 'long-dash'
  >();
  expectTypeOf<BlurSettings['borderPresetId']>().toEqualTypeOf<string | null | undefined>();
});
