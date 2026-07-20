import { expect, it, vi } from 'vitest';

const { scenarioSessionServiceCtorMock } = vi.hoisted(() => ({
  scenarioSessionServiceCtorMock: vi.fn(function ScenarioSessionServiceMock(this: {
    clearTab: ReturnType<typeof vi.fn>;
    kind: string;
  }) {
    this.clearTab = vi.fn();
    this.kind = 'scenario-session-service';
  }),
}));

vi.mock('../../scenario/session-service', () => ({
  ScenarioSessionService: scenarioSessionServiceCtorMock,
}));

import {
  clearBackgroundRuntimeTabState,
  clearBackgroundRuntimeTabModeState,
  createBackgroundRuntimeState,
  reconcileBackgroundRuntimeStartupState,
  resetBackgroundRuntimeStateForLocalDataErasure,
} from './index';
import { createViewerPortRegistration } from '../../capture/page-preparation/viewer-ports.test-support';

it('creates reconstructible, disposable, and durable background runtime owners', () => {
  const state = createBackgroundRuntimeState();

  expect(state.captureGuardState).toEqual({ isCapturing: false });
  expect(state.highlighterModeState).toEqual(new Map());
  expect(state.quickEditModeState).toEqual(new Map());
  expect(state.screenshotModeState).toEqual(new Map());
  expect(state.viewportOwnerState).toEqual(new Map());
  expect(state.viewportState).toEqual(new Map());
  expect(state.webSnapshotViewerPorts).toEqual(new Map());
  expect(state.scenarioSessionService).toEqual(
    expect.objectContaining({ kind: 'scenario-session-service' })
  );
});

it('creates factory-owned runtime maps for each service-worker state instance', () => {
  const first = createBackgroundRuntimeState();
  const second = createBackgroundRuntimeState();
  first.screenshotModeState.set(7, true);
  first.viewportOwnerState.set(7, 'debugger');
  first.webSnapshotViewerPorts?.set(7, createViewerPortRegistration({}));

  expect(second.screenshotModeState.has(7)).toBe(false);
  expect(second.viewportOwnerState.has(7)).toBe(false);
  expect(second.webSnapshotViewerPorts?.has(7)).toBe(false);
  expect(second.screenshotModeState).not.toBe(first.screenshotModeState);
  expect(second.viewportOwnerState).not.toBe(first.viewportOwnerState);
  expect(second.webSnapshotViewerPorts).not.toBe(first.webSnapshotViewerPorts);
});

it('clears reconstructible tab state and delegates durable tab cleanup', async () => {
  const state = createBackgroundRuntimeState();
  state.screenshotModeState.set(7, true);
  state.highlighterModeState.set(7, true);
  state.quickEditModeState.set(7, true);
  state.viewportOwnerState.set(7, 'debugger');
  state.viewportState.set(7, { width: 1280, height: 720 });
  state.webSnapshotViewerPorts?.set(7, createViewerPortRegistration({}));

  await clearBackgroundRuntimeTabState(state, 7);

  expect(state.screenshotModeState.has(7)).toBe(false);
  expect(state.highlighterModeState.has(7)).toBe(false);
  expect(state.quickEditModeState.has(7)).toBe(false);
  expect(state.viewportOwnerState.has(7)).toBe(false);
  expect(state.viewportState.has(7)).toBe(false);
  expect(state.webSnapshotViewerPorts?.has(7)).toBe(false);
  expect(state.scenarioSessionService.clearTab).toHaveBeenCalledWith(7);
});

it('clears navigation-scoped tab mode state without durable tab cleanup', () => {
  const state = createBackgroundRuntimeState();
  state.screenshotModeState.set(7, true);
  state.highlighterModeState.set(7, true);
  state.quickEditModeState.set(7, true);
  state.viewportOwnerState.set(7, 'debugger');
  state.viewportState.set(7, { width: 1280, height: 720 });
  state.webSnapshotViewerPorts?.set(7, createViewerPortRegistration({}));

  clearBackgroundRuntimeTabModeState(state, 7);

  expect(state.screenshotModeState.has(7)).toBe(false);
  expect(state.highlighterModeState.has(7)).toBe(false);
  expect(state.quickEditModeState.has(7)).toBe(false);
  expect(state.viewportOwnerState.has(7)).toBe(false);
  expect(state.viewportState.has(7)).toBe(false);
  expect(state.webSnapshotViewerPorts?.has(7)).toBe(false);
  expect(state.scenarioSessionService.clearTab).not.toHaveBeenCalled();
});

it('reconciles MV3 startup state without replacing durable owners', () => {
  const state = createBackgroundRuntimeState();
  const durableScenarioService = state.scenarioSessionService;
  state.screenshotModeState.set(7, true);
  state.highlighterModeState.set(7, true);
  state.quickEditModeState.set(7, true);
  state.viewportOwnerState.set(7, 'debugger');
  state.viewportState.set(7, { width: 1280, height: 720 });
  state.captureGuardState.isCapturing = true;
  state.webSnapshotViewerPorts?.set(7, createViewerPortRegistration({}));

  reconcileBackgroundRuntimeStartupState(state);

  expect(state.screenshotModeState).toEqual(new Map());
  expect(state.highlighterModeState).toEqual(new Map());
  expect(state.quickEditModeState).toEqual(new Map());
  expect(state.viewportOwnerState).toEqual(new Map());
  expect(state.viewportState).toEqual(new Map());
  expect(state.captureGuardState).toEqual({ isCapturing: false });
  expect(state.webSnapshotViewerPorts).toEqual(new Map());
  expect(state.scenarioSessionService).toBe(durableScenarioService);
});

it('resets all runtime owners for local data erasure', () => {
  const state = createBackgroundRuntimeState();
  const previousScenarioService = state.scenarioSessionService;
  const constructorCallsBeforeReset = scenarioSessionServiceCtorMock.mock.calls.length;
  state.screenshotModeState.set(7, true);
  state.highlighterModeState.set(7, true);
  state.captureGuardState.isCapturing = true;

  resetBackgroundRuntimeStateForLocalDataErasure(state);

  expect(state.screenshotModeState).toEqual(new Map());
  expect(state.highlighterModeState).toEqual(new Map());
  expect(state.captureGuardState).toEqual({ isCapturing: false });
  expect(state.scenarioSessionService).not.toBe(previousScenarioService);
  expect(scenarioSessionServiceCtorMock).toHaveBeenCalledTimes(constructorCallsBeforeReset + 1);
});
