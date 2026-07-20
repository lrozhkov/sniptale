import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const { buildScenarioEditorUrlMock, translateMock } = vi.hoisted(() => ({
  buildScenarioEditorUrlMock: vi.fn((options: { projectId?: string | null } = {}) =>
    options.projectId
      ? `chrome-extension://test/apps/extension/src/scenario-editor/index.html?projectId=${options.projectId}`
      : 'chrome-extension://test/apps/extension/src/scenario-editor/index.html'
  ),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../../../platform/navigation/extension-pages/scenario-editor', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../platform/navigation/extension-pages/scenario-editor')
  >()),
  buildScenarioEditorUrl: buildScenarioEditorUrlMock,
}));

import { GalleryScenarioProjectsCard } from './scenario-projects';

beforeEach(() => {
  vi.clearAllMocks();
});

it('renders recent scenario projects with project-scoped editor links', () => {
  const markup = renderToStaticMarkup(
    <GalleryScenarioProjectsCard
      scenarioProjects={[
        { id: 'project-1', name: 'Scenario one', createdAt: 1, updatedAt: 2 },
        { id: 'project-2', name: 'Scenario two', createdAt: 3, updatedAt: 4 },
      ]}
    />
  );

  expect(buildScenarioEditorUrlMock).toHaveBeenCalledWith({ projectId: 'project-1' });
  expect(buildScenarioEditorUrlMock).toHaveBeenCalledWith({ projectId: 'project-2' });
  expect(markup).toContain('gallery.app.scenarioProjectsTitle');
  expect(markup).toContain('Scenario one');
  expect(markup).toContain('Scenario two');
  expect(markup).toContain('projectId=project-1');
  expect(markup).toContain('projectId=project-2');
});

it('renders the scenario-project empty state when there are no projects', () => {
  const markup = renderToStaticMarkup(<GalleryScenarioProjectsCard scenarioProjects={[]} />);

  expect(markup).toContain('gallery.app.scenarioProjectsEmpty');
});
