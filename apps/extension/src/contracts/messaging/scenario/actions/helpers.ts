import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { ScenarioSessionResponse } from '../../contracts/response-types';
import { createRuntimeResponseGuard, isNumber, isString } from '../../validators/index';
import {
  isScenarioRecorderSurfaceState,
  isScenarioRestoreSnapshot,
  isScenarioSessionPayload,
  isScenarioSessionState,
} from '../validators/index';

const scenarioRuntimeResponseGuard = createRuntimeResponseGuard<ScenarioSessionResponse>({
  optional: {
    session: isScenarioSessionState,
    surface: isScenarioRecorderSurfaceState,
    projects: (value) => isScenarioSessionPayload({ projects: value }),
    recentSteps: (value) => isScenarioSessionPayload({ recentSteps: value }),
    trashedSteps: (value) => isScenarioSessionPayload({ trashedSteps: value }),
    projectRevision: isNumber,
    snapshot: isScenarioRestoreSnapshot,
    projectId: isString,
    stepId: isString,
  },
});

export function createScenarioRuntimeResponseParser(messageType: string) {
  return createGuardParser(`runtime ${messageType} response`, scenarioRuntimeResponseGuard);
}
