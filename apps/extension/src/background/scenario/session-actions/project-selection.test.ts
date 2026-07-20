import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const {
  buildScenarioPayloadResponseMock,
  createScenarioProjectRecordV3Mock,
  flushScenarioProjectCaptureMock,
  resolveProjectSelectionMock,
  setScenarioProjectSelectionMock,
  translateMock,
} = vi.hoisted(() => ({
  buildScenarioPayloadResponseMock: vi.fn(),
  createScenarioProjectRecordV3Mock: vi.fn(),
  flushScenarioProjectCaptureMock: vi.fn(),
  resolveProjectSelectionMock: vi.fn(),
  setScenarioProjectSelectionMock: vi.fn(),
  translateMock: vi.fn(() => 'New scenario'),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../../../composition/persistence/scenario/store/v3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/store/v3')>()),
  createScenarioProjectRecordV3: createScenarioProjectRecordV3Mock,
}));

vi.mock('../router/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../router/helpers')>()),
  resolveProjectSelection: resolveProjectSelectionMock,
}));

vi.mock('../router/action-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../router/action-helpers')>()),
  buildScenarioPayloadResponse: buildScenarioPayloadResponseMock,
  flushScenarioProjectCapture: flushScenarioProjectCaptureMock,
  setScenarioProjectSelection: setScenarioProjectSelectionMock,
}));

import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import { handleScenarioCreateProject, handleScenarioSetActiveProject } from './project-selection';

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioPayloadResponseMock.mockResolvedValue({ success: true });
  flushScenarioProjectCaptureMock.mockResolvedValue({});
  createScenarioProjectRecordV3Mock.mockResolvedValue({
    id: 'project-created',
    name: 'Created project',
  });
  resolveProjectSelectionMock.mockResolvedValue({
    id: 'project-9',
    name: 'Project 9',
  });
});

it('selects an existing project and flushes pending capture when needed', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  mockExistingProjectSelection(scenarioSessionService);

  const response = await handleScenarioSetActiveProject({
    resolvedTabId: 9,
    scenarioSessionService,
    message: {
      type: MessageType.SCENARIO_SET_ACTIVE_PROJECT,
      projectId: 'project-9',
      rememberProjectSelection: false,
    },
  });

  expectExistingProjectSelection(scenarioSessionService, response);
});

function mockExistingProjectSelection(
  scenarioSessionService: ReturnType<typeof createScenarioSessionServiceStub>
): void {
  vi.mocked(scenarioSessionService.setActiveProject).mockResolvedValue({
    enabled: true,
    captureMode: 'manual',
    projectId: 'project-9',
    projectName: 'Project 9',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
  flushScenarioProjectCaptureMock.mockResolvedValue({
    stepId: 'step-pending',
  });
}

function expectExistingProjectSelection(
  scenarioSessionService: ReturnType<typeof createScenarioSessionServiceStub>,
  response: unknown
): void {
  expect(resolveProjectSelectionMock).toHaveBeenCalledWith('project-9');
  expect(setScenarioProjectSelectionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectSelection: { id: 'project-9', name: 'Project 9' },
      rememberProjectSelection: false,
    })
  );
  expect(flushScenarioProjectCaptureMock).toHaveBeenCalledWith({
    resolvedTabId: 9,
    scenarioSessionService,
    projectId: 'project-9',
    message: {
      type: MessageType.SCENARIO_SET_ACTIVE_PROJECT,
      projectId: 'project-9',
      rememberProjectSelection: false,
    },
  });
  expect(response).toEqual(
    expect.objectContaining({
      success: true,
      projectId: 'project-9',
      stepId: 'step-pending',
    })
  );
}

it('skips capture flush when the resolved project selection has no id', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  resolveProjectSelectionMock.mockResolvedValue({
    id: null,
    name: null,
  });

  const response = await handleScenarioSetActiveProject({
    resolvedTabId: 9,
    scenarioSessionService,
    message: {
      type: MessageType.SCENARIO_SET_ACTIVE_PROJECT,
      projectId: null,
      rememberProjectSelection: true,
    },
  });

  expect(setScenarioProjectSelectionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectSelection: { id: null, name: null },
      rememberProjectSelection: true,
    })
  );
  expect(flushScenarioProjectCaptureMock).not.toHaveBeenCalled();
  expect(response).toEqual(expect.objectContaining({ success: true, projectId: undefined }));
});

it('creates a new project with the localized fallback name', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();

  const response = await handleScenarioCreateProject({
    resolvedTabId: 9,
    scenarioSessionService,
    message: {
      type: MessageType.SCENARIO_CREATE_PROJECT,
      name: '   ',
      rememberProjectSelection: false,
    },
  });

  expect(translateMock).toHaveBeenCalledWith('scenario.common.defaultProjectName');
  expect(createScenarioProjectRecordV3Mock).toHaveBeenCalledWith('New scenario');
  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenCalledWith(9);
  expect(setScenarioProjectSelectionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectSelection: { id: 'project-created', name: 'Created project' },
      rememberProjectSelection: false,
    })
  );
  expect(response).toEqual(
    expect.objectContaining({ success: true, projectId: 'project-created' })
  );
});
