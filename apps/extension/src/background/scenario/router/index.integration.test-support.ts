import { vi } from 'vitest';

import type { RuntimeScenarioRequestByType } from '../../../contracts/messaging/scenario/runtime';
import type { ScenarioSessionService } from '../session-service';
import { routeScenarioMessage } from './route';
import { flushScenarioRouterPromises } from './test-support';

type ScenarioRouterMessage = RuntimeScenarioRequestByType[keyof RuntimeScenarioRequestByType];

export async function routeScenarioTestMessage(
  message: ScenarioRouterMessage,
  scenarioSessionService: ScenarioSessionService
) {
  const sendResponse = vi.fn();
  const handled = routeScenarioMessage({
    message,
    resolvedTabId: 9,
    sendResponse,
    scenarioSessionService,
  });
  await flushScenarioRouterPromises();
  return { handled, sendResponse };
}
