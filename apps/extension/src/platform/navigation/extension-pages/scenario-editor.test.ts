import { describe, expect, it, vi } from 'vitest';

const { getURLMock } = vi.hoisted(() => ({
  getURLMock: vi.fn((path: string) => `chrome-extension://test/${path}`),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: getURLMock,
  },
}));

import { buildScenarioEditorUrl } from './scenario-editor';

describe('extension page scenario editor urls', () => {
  it('builds the canonical scenario editor url with optional project and step ids', () => {
    expect(buildScenarioEditorUrl()).toBe(
      'chrome-extension://test/apps/extension/src/scenario-editor/index.html'
    );
    expect(buildScenarioEditorUrl({ projectId: 'project-7' })).toBe(
      'chrome-extension://test/apps/extension/src/scenario-editor/index.html?projectId=project-7'
    );
    expect(buildScenarioEditorUrl({ projectId: 'project-7', stepId: 'step-4' })).toBe(
      'chrome-extension://test/apps/extension/src/scenario-editor/index.html?projectId=project-7&stepId=step-4'
    );
    expect(
      buildScenarioEditorUrl({
        presentationSessionId: 'session 7',
        presentationView: 'audience',
        projectId: 'project-7',
      })
    ).toBe(
      'chrome-extension://test/apps/extension/src/scenario-editor/index.html?' +
        'projectId=project-7&presentationView=audience&presentationSessionId=session+7'
    );
  });
});
