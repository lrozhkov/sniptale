import { describe, expect, it } from 'vitest';

import { DESIGN_TOKEN_GROUPS } from './token-groups';

describe('design token groups registry', () => {
  it('points every token group at the final shared UI token stylesheet', () => {
    expect(new Set(DESIGN_TOKEN_GROUPS.map((group) => group.source))).toEqual(
      new Set(['@sniptale/ui/styles/design-tokens'])
    );
  });
});
