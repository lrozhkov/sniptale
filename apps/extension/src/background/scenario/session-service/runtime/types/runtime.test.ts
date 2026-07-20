import { expectTypeOf, it } from 'vitest';

import type { ScenarioSessionServiceRuntime as FacadeRuntime } from './index';
import type { ScenarioSessionServiceRuntime as RoleRuntime } from './index';

it('keeps the runtime role aligned with the root facade', () => {
  expectTypeOf<RoleRuntime>().toEqualTypeOf<FacadeRuntime>();
});
