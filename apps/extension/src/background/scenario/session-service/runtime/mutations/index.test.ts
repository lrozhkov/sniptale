import { expect, it } from 'vitest';

import * as facade from './index';
import * as persisted from './persisted';
import * as project from './project';
import * as sessionState from './session-state';
import * as surface from './surface';

it('keeps the mutation facade as a thin stable forwarding layer', () => {
  expect(facade.createScenarioSessionServiceProjectMutationApi).toBe(
    project.createScenarioSessionServiceProjectMutationApi
  );
  expect(facade.createScenarioSessionServiceSessionStateMutationApi).toBe(
    sessionState.createScenarioSessionServiceSessionStateMutationApi
  );
  expect(facade.createScenarioSessionServiceSurfaceMutationApi).toBe(
    surface.createScenarioSessionServiceSurfaceMutationApi
  );
  expect(persisted.runPersistedMutation).toBeTypeOf('function');
});
