import { expectTypeOf, it } from 'vitest';
import type { ManagedToolPreset, ToolPresetOwner } from './types';
it('keeps tool owner and preset contracts domain-derived', () => {
  expectTypeOf<ToolPresetOwner>().toMatchTypeOf<string>();
  expectTypeOf<ManagedToolPreset>().toHaveProperty('id');
});
