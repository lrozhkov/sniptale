import { expectTypeOf, it } from 'vitest';

import type { ScenarioSessionServiceCore as FacadeCore } from './index';
import type { ScenarioSessionServiceCore as RoleCore } from './core';

it('keeps the core role aligned with the root facade', () => {
  expectTypeOf<RoleCore>().toEqualTypeOf<FacadeCore>();
});
