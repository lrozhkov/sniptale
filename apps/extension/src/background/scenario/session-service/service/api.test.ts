import { expect, it } from 'vitest';

import * as facade from './api';
import { ScenarioSessionService } from './api/index';

it('keeps the root api file as a thin facade over the service owner', () => {
  expect(facade.ScenarioSessionService).toBe(ScenarioSessionService);
});
