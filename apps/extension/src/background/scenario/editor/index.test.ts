import { beforeEach, describe, expect, it, vi } from 'vitest';

const { browserTabsCreateMock, buildScenarioEditorUrlMock } = vi.hoisted(() => ({
  browserTabsCreateMock: vi.fn(),
  buildScenarioEditorUrlMock: vi.fn(
    (options: { projectId?: string | null; stepId?: string | null } = {}) =>
      `chrome-extension://test/scenario-editor?projectId=${options.projectId ?? ''}&stepId=${options.stepId ?? ''}`
  ),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    create: browserTabsCreateMock,
  },
}));

vi.mock('../../../platform/navigation/extension-pages/scenario-editor', () => ({
  buildScenarioEditorUrl: buildScenarioEditorUrlMock,
}));

import { openScenarioEditor } from './index';

beforeEach(() => {
  vi.clearAllMocks();
  browserTabsCreateMock.mockResolvedValue(undefined);
});

describe('openScenarioEditor', () => {
  it('opens a new tab with the scenario editor URL', async () => {
    await openScenarioEditor('project-1', 'step-3');
    await openScenarioEditor();

    expect(buildScenarioEditorUrlMock).toHaveBeenNthCalledWith(1, {
      projectId: 'project-1',
      stepId: 'step-3',
    });
    expect(buildScenarioEditorUrlMock).toHaveBeenNthCalledWith(2, {});
    expect(browserTabsCreateMock).toHaveBeenCalledTimes(2);
  });
});
