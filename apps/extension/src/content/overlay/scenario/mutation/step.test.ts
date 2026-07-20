// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const transportMocks = vi.hoisted(() => ({
  deleteScenarioStepMock: vi.fn(),
  moveScenarioStepMock: vi.fn(),
  restoreScenarioStepMock: vi.fn(),
}));

vi.mock('../runtime/transport/steps', () => ({
  deleteScenarioStep: transportMocks.deleteScenarioStepMock,
  moveScenarioStep: transportMocks.moveScenarioStepMock,
  restoreScenarioStep: transportMocks.restoreScenarioStepMock,
  saveScenarioCaptureStep: vi.fn(),
}));

import {
  applyScenarioDeleteRecentStep,
  applyScenarioMoveRecentStep,
  applyScenarioRestoreRecentStep,
} from './step';

beforeEach(() => {
  vi.clearAllMocks();
  transportMocks.deleteScenarioStepMock.mockResolvedValue({ success: true });
  transportMocks.moveScenarioStepMock.mockResolvedValue({ success: true });
  transportMocks.restoreScenarioStepMock.mockResolvedValue({ success: true });
});

describe('scenario-controller-step-actions', () => {
  it('routes recent-step mutations through the transport owner', async () => {
    const applyScenarioResponse = vi.fn();

    await applyScenarioDeleteRecentStep({
      applyScenarioResponse,
      projectId: 'project-9',
      stepId: 'step-1',
    });
    await applyScenarioMoveRecentStep({
      applyScenarioResponse,
      projectId: 'project-9',
      stepId: 'step-1',
      toIndex: 4,
    });
    await applyScenarioRestoreRecentStep({
      applyScenarioResponse,
      projectId: 'project-9',
      stepId: 'step-1',
    });

    expect(transportMocks.deleteScenarioStepMock).toHaveBeenCalledWith({
      projectId: 'project-9',
      stepId: 'step-1',
    });
    expect(transportMocks.moveScenarioStepMock).toHaveBeenCalledWith({
      projectId: 'project-9',
      stepId: 'step-1',
      toIndex: 4,
    });
    expect(transportMocks.restoreScenarioStepMock).toHaveBeenCalledWith({
      projectId: 'project-9',
      stepId: 'step-1',
    });
    expect(applyScenarioResponse).toHaveBeenCalledTimes(3);
  });
});
