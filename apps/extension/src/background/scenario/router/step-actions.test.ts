import { beforeEach, expect, it, vi } from 'vitest';

const {
  buildScenarioSessionPayloadMock,
  deleteScenarioStepFromProjectMock,
  moveScenarioStepInProjectMock,
  openScenarioEditorMock,
  restoreScenarioStepFromProjectMock,
} = vi.hoisted(() => ({
  buildScenarioSessionPayloadMock: vi.fn(),
  deleteScenarioStepFromProjectMock: vi.fn(),
  moveScenarioStepInProjectMock: vi.fn(),
  openScenarioEditorMock: vi.fn(),
  restoreScenarioStepFromProjectMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/scenario/store/project-steps/index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/scenario/store/project-steps/index')
    >()),
    deleteScenarioStepFromProject: deleteScenarioStepFromProjectMock,
    moveScenarioStepInProject: moveScenarioStepInProjectMock,
    restoreScenarioStepFromProject: restoreScenarioStepFromProjectMock,
  })
);

vi.mock('../editor', () => ({
  openScenarioEditor: openScenarioEditorMock,
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  buildScenarioSessionPayload: buildScenarioSessionPayloadMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  handleScenarioDeleteStep,
  handleScenarioMoveStep,
  handleScenarioOpenEditor,
  handleScenarioRestoreStep,
} from './step-actions';
import { createScenarioSessionServiceStub } from './test-support';

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioSessionPayloadMock.mockResolvedValue({ session: { enabled: true } });
});

function mockActiveProject(
  scenarioSessionService: ReturnType<typeof createScenarioSessionServiceStub>,
  projectId = 'project-1'
): void {
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue({
    enabled: true,
    captureMode: 'manual',
    projectId,
    projectName: 'Project session',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
}

it('bumps project revision for delete, move, and restore mutations', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  mockActiveProject(scenarioSessionService);
  deleteScenarioStepFromProjectMock.mockResolvedValue({ id: 'project-1', updatedAt: 10 });
  moveScenarioStepInProjectMock.mockResolvedValue({ id: 'project-1', updatedAt: 20 });
  restoreScenarioStepFromProjectMock.mockResolvedValue({ id: 'project-1', updatedAt: 30 });

  await handleScenarioDeleteStep({
    message: { type: MessageType.SCENARIO_DELETE_STEP, projectId: 'project-1', stepId: 'step-1' },
    resolvedTabId: 7,
    scenarioSessionService,
  });
  await handleScenarioMoveStep({
    message: {
      type: MessageType.SCENARIO_MOVE_STEP,
      projectId: 'project-1',
      stepId: 'step-1',
      toIndex: 2,
    },
    resolvedTabId: 7,
    scenarioSessionService,
  });
  await handleScenarioRestoreStep({
    message: { type: MessageType.SCENARIO_RESTORE_STEP, projectId: 'project-1', stepId: 'step-1' },
    resolvedTabId: 7,
    scenarioSessionService,
  });

  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenCalledTimes(3);
});

it('opens the editor using the active session project', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  mockActiveProject(scenarioSessionService, 'project-session');

  await expect(
    handleScenarioOpenEditor({
      message: { type: MessageType.SCENARIO_OPEN_EDITOR },
      resolvedTabId: 8,
      scenarioSessionService,
    })
  ).resolves.toEqual({ success: true, result: 'accepted' });

  expect(openScenarioEditorMock).toHaveBeenCalledWith('project-session', null);
});

it('rejects step mutations outside the active session project', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  mockActiveProject(scenarioSessionService, 'project-a');

  await expect(
    handleScenarioDeleteStep({
      message: { type: MessageType.SCENARIO_DELETE_STEP, projectId: 'project-b', stepId: 'step-1' },
      resolvedTabId: 7,
      scenarioSessionService,
    })
  ).rejects.toThrow('Unauthorized scenario project mutation');
  await expect(
    handleScenarioMoveStep({
      message: {
        type: MessageType.SCENARIO_MOVE_STEP,
        projectId: 'project-b',
        stepId: 'step-1',
        toIndex: 0,
      },
      resolvedTabId: 7,
      scenarioSessionService,
    })
  ).rejects.toThrow('Unauthorized scenario project mutation');
  await expect(
    handleScenarioRestoreStep({
      message: {
        type: MessageType.SCENARIO_RESTORE_STEP,
        projectId: 'project-b',
        stepId: 'step-1',
      },
      resolvedTabId: 7,
      scenarioSessionService,
    })
  ).rejects.toThrow('Unauthorized scenario project mutation');

  expect(deleteScenarioStepFromProjectMock).not.toHaveBeenCalled();
  expect(moveScenarioStepInProjectMock).not.toHaveBeenCalled();
  expect(restoreScenarioStepFromProjectMock).not.toHaveBeenCalled();
  expect(scenarioSessionService.bumpProjectRevision).not.toHaveBeenCalled();
});

it('rejects explicit editor opens outside the active session project', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  mockActiveProject(scenarioSessionService, 'project-a');

  await expect(
    handleScenarioOpenEditor({
      message: {
        type: MessageType.SCENARIO_OPEN_EDITOR,
        projectId: 'project-b',
        stepId: 'step-1',
      },
      resolvedTabId: 8,
      scenarioSessionService,
    })
  ).rejects.toThrow('Unauthorized scenario project mutation');

  expect(openScenarioEditorMock).not.toHaveBeenCalled();
});
