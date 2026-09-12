import { expect, it } from 'vitest';
import { resolveGuideBlockWidth } from './layout';

it('resolves presets and explicit overrides identically for every block kind', () => {
  for (const kind of ['image', 'image-slot', 'text', 'heading', 'note'] as const) {
    for (const layout of ['stacked', 'text', 'side-by-side', 'comparison'] as const) {
      expect(resolveGuideBlockWidth(layout, { kind, width: 'half' })).toBe('half');
      expect(resolveGuideBlockWidth(layout, { kind, width: 'full' })).toBe('full');
      expect(resolveGuideBlockWidth(layout, { kind })).toBe(
        layout === 'side-by-side' ||
          (layout === 'comparison' && ['image', 'image-slot'].includes(kind))
          ? 'half'
          : 'full'
      );
    }
  }
});
