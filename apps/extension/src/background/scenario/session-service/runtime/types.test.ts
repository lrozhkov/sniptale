import { expectTypeOf, it } from 'vitest';

import type { ScenarioSessionServiceCore as FacadeCore } from './types/index';
import type { ScenarioSessionServiceRuntime as FacadeRuntime } from './types/index';
import type { ScenarioSessionServiceState as FacadeState } from './types/index';
import type { ScenarioSessionServiceCore as CoreRole } from './types/core';
import type { ScenarioSessionServiceRuntime as RuntimeRole } from './types/index';
import type { ScenarioSessionServiceState as StateRole } from './types/state';

it('keeps the runtime type facade aligned with the role files', () => {
  expectTypeOf<FacadeState>().toEqualTypeOf<StateRole>();
  expectTypeOf<FacadeCore>().toEqualTypeOf<CoreRole>();
  expectTypeOf<FacadeRuntime>().toEqualTypeOf<RuntimeRole>();
});
