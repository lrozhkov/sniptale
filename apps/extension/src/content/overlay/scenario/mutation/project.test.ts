// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const transportMocks = vi.hoisted(() => ({
  createScenarioProjectMock: vi.fn(),
  setScenarioActiveProjectMock: vi.fn(),
}));

const helperMocks = vi.hoisted(() => ({
  showToastMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: helperMocks.translateMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: helperMocks.showToastMock,
}));

vi.mock('../runtime/transport/projects', () => ({
  createScenarioProject: transportMocks.createScenarioProjectMock,
  openScenarioEditor: vi.fn(),
  setScenarioActiveProject: transportMocks.setScenarioActiveProjectMock,
}));

import { applyScenarioProjectCreation, applyScenarioProjectSelection } from './project';
import type { ScenarioControllerResponse } from '../types';
import { createScenarioSession } from '../session/test-support';

beforeEach(() => {
  vi.clearAllMocks();
  transportMocks.setScenarioActiveProjectMock.mockResolvedValue({ success: true, session: {} });
  transportMocks.createScenarioProjectMock.mockResolvedValue({
    success: true,
    projectId: 'project-2',
    session: { projectId: 'project-2' },
  });
});

describe('scenario-controller-project-actions', () => {
  it('routes project selection through the active-project transport', async () => {
    const applyScenarioResponse = vi.fn();

    await applyScenarioProjectSelection({
      applyScenarioResponse,
      currentSession: createScenarioSession({ rememberProjectSelection: false }),
      projectId: 'project-9',
    });

    expect(transportMocks.setScenarioActiveProjectMock).toHaveBeenCalledWith({
      projectId: 'project-9',
      rememberProjectSelection: false,
    });
    expect(applyScenarioResponse).toHaveBeenCalledTimes(1);
  });

  it('creates projects through transport and surfaces create errors', async () => {
    const applyScenarioResponse = vi.fn();
    const refreshSession = vi.fn(async () => undefined);

    await expectSuccessfulProjectCreation(applyScenarioResponse, refreshSession);

    transportMocks.createScenarioProjectMock.mockResolvedValueOnce({
      success: false,
      error: 'Create failed',
    });

    await expectFailedProjectCreation(applyScenarioResponse, refreshSession);

    expect(helperMocks.showToastMock).toHaveBeenCalledWith('Create failed', 'error');
  });
});

async function expectSuccessfulProjectCreation(
  applyScenarioResponse: (response: ScenarioControllerResponse) => void,
  refreshSession: () => Promise<void>
) {
  await applyScenarioProjectCreation({
    applyScenarioResponse,
    currentSession: createScenarioSession(),
    name: '  ',
    refreshSession,
  });

  expect(transportMocks.createScenarioProjectMock).toHaveBeenCalledWith({
    name: '  ',
    rememberProjectSelection: true,
  });
  expect(applyScenarioResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      session: expect.objectContaining({
        projectId: 'project-2',
        projectName: 'scenario.common.defaultProjectName',
      }),
    })
  );
  expect(refreshSession).toHaveBeenCalledTimes(1);
}

async function expectFailedProjectCreation(
  applyScenarioResponse: (response: ScenarioControllerResponse) => void,
  refreshSession: () => Promise<void>
) {
  await expect(
    applyScenarioProjectCreation({
      applyScenarioResponse,
      currentSession: createScenarioSession(),
      name: 'New project',
      refreshSession,
    })
  ).rejects.toThrow('Create failed');
}
