import { expectTypeOf, it } from 'vitest';

import type { DesignSystemPageFilterState, DesignSystemPageState } from './types';

it('keeps page state assignable to the command palette filter contract', () => {
  expectTypeOf<DesignSystemPageState>().toMatchTypeOf<DesignSystemPageFilterState>();
});
