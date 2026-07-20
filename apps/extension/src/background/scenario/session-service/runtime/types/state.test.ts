import { expectTypeOf, it } from 'vitest';

import type { ScenarioSessionServiceState as FacadeState } from './index';
import type { ScenarioSessionServiceState as RoleState } from './state';

it('keeps the state role aligned with the root facade', () => {
  expectTypeOf<RoleState>().toEqualTypeOf<FacadeState>();
});
