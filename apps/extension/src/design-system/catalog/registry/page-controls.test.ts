import { describe, expect, it } from 'vitest';

import {
  DESIGN_SYSTEM_KIND_FILTERS,
  DESIGN_SYSTEM_PAGE_NAVIGATION,
  DESIGN_SYSTEM_SCOPE_FILTERS,
  DESIGN_SYSTEM_USAGE_MODES,
} from './page-controls';

function expectUnique(values: string[]): void {
  expect(new Set(values)).toHaveLength(values.length);
}

describe('design-system page-control registry', () => {
  it('keeps action ids unique across navigation and filter metadata', () => {
    expectUnique([
      ...DESIGN_SYSTEM_PAGE_NAVIGATION.map((item) => item.actionId),
      ...DESIGN_SYSTEM_SCOPE_FILTERS.map((item) => item.actionId),
      ...DESIGN_SYSTEM_KIND_FILTERS.map((item) => item.actionId),
      ...DESIGN_SYSTEM_USAGE_MODES.map((item) => item.actionId),
    ]);
  });

  it('covers one canonical option set for each page-control family', () => {
    expect(DESIGN_SYSTEM_PAGE_NAVIGATION.map((item) => item.id)).toEqual([
      'overview',
      'tokens',
      'shared-catalog',
      'product-catalog',
    ]);
    expect(DESIGN_SYSTEM_SCOPE_FILTERS.map((item) => item.value)).toEqual([
      'all',
      'shared-ui',
      'product-ui',
    ]);
    expect(DESIGN_SYSTEM_KIND_FILTERS.map((item) => item.value)).toEqual([
      'all',
      'primitive',
      'surface',
      'feedback',
      'composition',
    ]);
    expect(DESIGN_SYSTEM_USAGE_MODES.map((item) => item.value)).toEqual(['any', 'all']);
  });
});
