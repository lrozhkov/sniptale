import { expectTypeOf, it } from 'vitest';
import type { EditorPaletteKey } from './types';
it('keeps palette keys domain-derived', () => {
  expectTypeOf<'shapeStroke'>().toMatchTypeOf<EditorPaletteKey>();
});
