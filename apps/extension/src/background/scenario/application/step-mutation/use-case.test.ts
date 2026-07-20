import { beforeEach, expect, it, vi } from 'vitest';

import type { ScenarioStepMutationPorts } from './ports';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import {
  assertActiveScenarioProjectAuthority,
  assertScenarioProjectMatchesSession,
  deleteScenarioStepUseCase,
  moveScenarioStepUseCase,
  restoreScenarioStepUseCase,
} from './use-case';

function createActiveSession(projectId = 'project-1'): ScenarioSessionState {
  return {
    enabled: true,
    captureMode: 'manual',
    projectId,
    projectName: 'Project 1',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  };
}

function createPorts(): ScenarioStepMutationPorts {
  const activeSession = createActiveSession();

  return {
    buildSessionPayload: vi.fn(async () => ({ session: activeSession })),
    bumpProjectRevision: vi.fn(),
    getSession: vi.fn(async () => activeSession),
    repository: {
      deleteStepFromProject: vi.fn(async () => ({ id: 'project-1', updatedAt: 10 })),
      moveStepInProject: vi.fn(async () => ({ id: 'project-1', updatedAt: 20 })),
      restoreStepFromProject: vi.fn(async () => ({ id: 'project-1', updatedAt: 30 })),
    },
  };
}

let ports: ScenarioStepMutationPorts;

beforeEach(() => {
  ports = createPorts();
});

it('runs delete, move, and restore through repository ports and bumps revision after changes', async () => {
  await deleteScenarioStepUseCase({
    ports,
    projectId: 'project-1',
    stepId: 'step-1',
    tabId: 7,
  });
  await moveScenarioStepUseCase({
    ports,
    projectId: 'project-1',
    stepId: 'step-1',
    tabId: 7,
    toIndex: 2,
  });
  const response = await restoreScenarioStepUseCase({
    ports,
    projectId: 'project-1',
    stepId: 'step-1',
    tabId: 7,
  });

  expect(ports.repository.deleteStepFromProject).toHaveBeenCalledWith('project-1', 'step-1');
  expect(ports.repository.moveStepInProject).toHaveBeenCalledWith('project-1', 'step-1', 2);
  expect(ports.repository.restoreStepFromProject).toHaveBeenCalledWith('project-1', 'step-1');
  expect(ports.bumpProjectRevision).toHaveBeenCalledTimes(3);
  expect(ports.buildSessionPayload).toHaveBeenLastCalledWith(7);
  expect(response).toEqual({ success: true, session: createActiveSession() });
});

it('skips revision bumps when the repository reports no project change', async () => {
  vi.mocked(ports.repository.deleteStepFromProject).mockResolvedValue(undefined);

  await deleteScenarioStepUseCase({
    ports,
    projectId: 'project-1',
    stepId: 'missing-step',
    tabId: 8,
  });

  expect(ports.bumpProjectRevision).not.toHaveBeenCalled();
  expect(ports.buildSessionPayload).toHaveBeenCalledWith(8);
});

it('rejects project mutations outside the active session project before repository writes', async () => {
  vi.mocked(ports.getSession).mockResolvedValue(createActiveSession('project-active'));

  await expect(
    moveScenarioStepUseCase({
      ports,
      projectId: 'project-other',
      stepId: 'step-1',
      tabId: 9,
      toIndex: 0,
    })
  ).rejects.toThrow('Unauthorized scenario project mutation');

  expect(ports.repository.moveStepInProject).not.toHaveBeenCalled();
  expect(ports.bumpProjectRevision).not.toHaveBeenCalled();
  expect(ports.buildSessionPayload).not.toHaveBeenCalled();
});

it('exposes the active-project guard for route-adjacent editor actions', async () => {
  await expect(
    assertActiveScenarioProjectAuthority({
      ports,
      projectId: 'project-1',
      tabId: 10,
    })
  ).resolves.toBeUndefined();

  expect(ports.getSession).toHaveBeenCalledWith(10);
});

it('rejects a mismatched project against an already-read session snapshot', () => {
  expect(() =>
    assertScenarioProjectMatchesSession({
      projectId: 'project-other',
      session: createActiveSession('project-active'),
    })
  ).toThrow('Unauthorized scenario project mutation');
});
