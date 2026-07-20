import { beforeEach, expect, it, vi } from 'vitest';

const { createScenarioProjectRecordV3Mock, translateMock } = vi.hoisted(() => ({
  createScenarioProjectRecordV3Mock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', () => ({
  translate: translateMock,
}));

vi.mock('../../../composition/persistence/scenario/store/v3', () => ({
  createScenarioProjectRecordV3: createScenarioProjectRecordV3Mock,
}));

import { ensureScenarioCaptureProject } from './project-selection';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

beforeEach(() => {
  vi.clearAllMocks();
  createScenarioProjectRecordV3Mock.mockResolvedValue({
    id: 'project-auto',
    name: 'Release dashboard • Mar 30, 2026, 1:00 AM',
  });
});

it('reuses the active scenario project without creating a new one', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue({
    enabled: true,
    captureMode: 'manual',
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });

  await expect(
    ensureScenarioCaptureProject({
      page: {
        title: 'Release dashboard',
        url: 'https://example.test/releases',
        viewport: { x: 0, y: 0, width: 1440, height: 900 },
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 2,
      },
      scenarioSessionService,
      tabId: 5,
    })
  ).resolves.toEqual({ id: 'project-1', name: 'Project 1' });

  expect(createScenarioProjectRecordV3Mock).not.toHaveBeenCalled();
  expect(scenarioSessionService.setActiveProject).not.toHaveBeenCalled();
});

it('creates and selects an auto-named project when the session has no active project', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue({
    enabled: true,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });

  await expect(
    ensureScenarioCaptureProject({
      createdAt: Date.UTC(2026, 2, 30, 1, 0, 0),
      page: {
        title: '',
        url: 'https://example.test/releases',
        viewport: { x: 0, y: 0, width: 1440, height: 900 },
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 2,
      },
      scenarioSessionService,
      tabId: 6,
    })
  ).resolves.toEqual({
    id: 'project-auto',
    name: 'Release dashboard • Mar 30, 2026, 1:00 AM',
  });

  expect(createScenarioProjectRecordV3Mock).toHaveBeenCalledWith(
    expect.stringContaining('scenario.common.defaultProjectName')
  );
  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenCalledWith(6);
  expect(scenarioSessionService.setActiveProject).toHaveBeenCalledWith(
    6,
    { id: 'project-auto', name: 'Release dashboard • Mar 30, 2026, 1:00 AM' },
    { rememberProjectSelection: true }
  );
});
