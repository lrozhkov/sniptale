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

import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  handleScenarioDeleteStep,
  handleScenarioMoveStep,
  handleScenarioOpenEditor,
  handleScenarioRestoreStep,
} from './step-actions';

function createActiveScenarioSession() {
  return {
    enabled: true,
    captureMode: 'manual' as const,
    projectId: 'project-session',
    projectName: 'Project session',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioSessionPayloadMock.mockResolvedValue({
    session: {
      enabled: true,
      captureMode: 'manual',
      projectId: 'project-1',
      projectName: 'Project 1',
      rememberProjectSelection: true,
      pendingProjectSelection: false,
      sidebarVisible: true,
    },
  });
});

it('bumps project revision for delete, move, and restore mutations', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue({
    ...createActiveScenarioSession(),
    projectId: 'project-1',
  });
  deleteScenarioStepFromProjectMock.mockResolvedValue({ id: 'project-1', updatedAt: 10 });
  moveScenarioStepInProjectMock.mockResolvedValue({ id: 'project-1', updatedAt: 20 });
  restoreScenarioStepFromProjectMock.mockResolvedValue({ id: 'project-1', updatedAt: 30 });

  const deleteResponse = await handleScenarioDeleteStep({
    message: {
      type: MessageType.SCENARIO_DELETE_STEP,
      projectId: 'project-1',
      stepId: 'step-1',
    },
    resolvedTabId: 7,
    scenarioSessionService,
  });
  const moveResponse = await handleScenarioMoveStep({
    message: {
      type: MessageType.SCENARIO_MOVE_STEP,
      projectId: 'project-1',
      stepId: 'step-1',
      toIndex: 2,
    },
    resolvedTabId: 7,
    scenarioSessionService,
  });
  const restoreResponse = await handleScenarioRestoreStep({
    message: {
      type: MessageType.SCENARIO_RESTORE_STEP,
      projectId: 'project-1',
      stepId: 'step-1',
    },
    resolvedTabId: 7,
    scenarioSessionService,
  });

  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenNthCalledWith(1, 7);
  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenNthCalledWith(2, 7);
  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenNthCalledWith(3, 7);
  expect(deleteResponse).toEqual(expect.objectContaining({ success: true }));
  expect(moveResponse).toEqual(expect.objectContaining({ success: true }));
  expect(restoreResponse).toEqual(expect.objectContaining({ success: true }));
});

it('skips revision bumps for no-op mutations and falls back to the active session project', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue(createActiveScenarioSession());
  deleteScenarioStepFromProjectMock.mockResolvedValue(undefined);
  moveScenarioStepInProjectMock.mockResolvedValue(undefined);
  restoreScenarioStepFromProjectMock.mockResolvedValue(undefined);

  await handleScenarioDeleteStep({
    message: {
      type: MessageType.SCENARIO_DELETE_STEP,
      projectId: 'project-session',
      stepId: 'step-1',
    },
    resolvedTabId: 8,
    scenarioSessionService,
  });
  await handleScenarioMoveStep({
    message: {
      type: MessageType.SCENARIO_MOVE_STEP,
      projectId: 'project-session',
      stepId: 'step-1',
      toIndex: 0,
    },
    resolvedTabId: 8,
    scenarioSessionService,
  });
  await handleScenarioRestoreStep({
    message: {
      type: MessageType.SCENARIO_RESTORE_STEP,
      projectId: 'project-session',
      stepId: 'step-1',
    },
    resolvedTabId: 8,
    scenarioSessionService,
  });
  const openEditorResponse = await handleScenarioOpenEditor({
    message: { type: MessageType.SCENARIO_OPEN_EDITOR },
    resolvedTabId: 8,
    scenarioSessionService,
  });

  expect(scenarioSessionService.bumpProjectRevision).not.toHaveBeenCalled();
  expect(openScenarioEditorMock).toHaveBeenCalledWith('project-session', null);
  expect(openEditorResponse).toEqual({ success: true, result: 'accepted' });
});
