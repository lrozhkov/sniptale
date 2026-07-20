import { expect, it } from 'vitest';

import { createBackgroundRuntimeState } from '../runtime-state';
import { backgroundRuntimeCleanupAdapter } from './runtime-cleanup';

it('resets reconstructible, disposable, and durable background runtime state', async () => {
  const state = createBackgroundRuntimeState();
  state.screenshotModeState.set(7, true);
  state.highlighterModeState.set(7, true);
  state.quickEditModeState.set(7, true);
  state.viewportState.set(7, { height: 600, width: 800 });
  state.captureGuardState.isCapturing = true;
  const previousScenarioSessionService = state.scenarioSessionService;

  const result = await backgroundRuntimeCleanupAdapter.cleanup(state);

  expect(result).toEqual([
    {
      id: 'background-runtime-state',
      remainingCount: 0,
      severity: 'required',
      status: 'verified-empty',
    },
  ]);
  expect(state.screenshotModeState.size).toBe(0);
  expect(state.highlighterModeState.size).toBe(0);
  expect(state.quickEditModeState.size).toBe(0);
  expect(state.viewportState.size).toBe(0);
  expect(state.captureGuardState.isCapturing).toBe(false);
  expect(state.scenarioSessionService).not.toBe(previousScenarioSessionService);
});
