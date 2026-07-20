// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioProjectV3, createScenarioSlide } from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { ScenarioV3EditorShell } from './view';

const {
  createPresentationSessionMock,
  endPresentationSessionMock,
  openScenarioAudiencePageMock,
  updatePresentationPositionMock,
} = vi.hoisted(() => ({
  createPresentationSessionMock: vi.fn(),
  endPresentationSessionMock: vi.fn(),
  openScenarioAudiencePageMock: vi.fn(),
  updatePresentationPositionMock: vi.fn(),
}));

vi.mock('../project/export/deck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../project/export/deck')>();
  return {
    ...actual,
    buildScenarioDeckExport: vi.fn(),
  };
});
vi.mock('../../composition/persistence/scenario/store/public', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../composition/persistence/scenario/store/public')>();
  return {
    ...actual,
    getScenarioAssetBlob: vi.fn(),
  };
});
vi.mock('./image-import', () => ({
  insertImageFileIntoSelectedSlide: vi.fn(),
}));
vi.mock('../platform/browser-driver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../platform/browser-driver')>();
  return {
    ...actual,
    downloadScenarioEditorBlob: vi.fn(),
  };
});
vi.mock('../../platform/navigation/extension-pages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/navigation/extension-pages')>();
  return {
    ...actual,
    openScenarioAudiencePage: openScenarioAudiencePageMock,
  };
});
vi.mock('./presentation/session', () => ({
  ScenarioPresentationSessionPosition: undefined,
  ScenarioPresentationSessionState: undefined,
  ScenarioPresentationSessionStatus: undefined,
  SCENARIO_PRESENTATION_SESSION_STATUS: {
    active: 'active',
    ended: 'ended',
  },
  createScenarioPresentationSession: createPresentationSessionMock,
  endScenarioPresentationSession: endPresentationSessionMock,
  loadScenarioPresentationSession: vi.fn(),
  subscribeToScenarioPresentationSession: vi.fn(),
  updateScenarioPresentationPosition: updatePresentationPositionMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderShell() {
  const project = createPresentationProject();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ScenarioV3EditorShell project={project} onProjectChange={vi.fn()} />);
  });
}

function clickButton(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => {
    button?.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.useFakeTimers({ now: new Date('2026-05-14T10:00:00Z') });
  createPresentationSessionMock.mockResolvedValue({
    sessionId: 'session-1',
  });
  updatePresentationPositionMock.mockImplementation(
    async (sessionId, position, projectUpdatedAt) => ({
      ...position,
      projectId: 'project-1',
      projectUpdatedAt,
      revision: 2,
      sessionId,
      status: 'active',
    })
  );
  endPresentationSessionMock.mockResolvedValue(undefined);
  openScenarioAudiencePageMock.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('resets presenter elapsed time when re-entering and exits with Escape', () => {
  renderShell();

  clickButton(translate('scenario.editor.modePresenter'));
  act(() => {
    vi.advanceTimersByTime(2100);
  });

  expect(container?.querySelector('[data-ui="scenario.editor.v3.presenter"]')).not.toBeNull();
  expect(container?.textContent).toContain('00:02');

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  expect(container?.querySelector('[data-ui="scenario.canvas.stage"]')).not.toBeNull();

  clickButton(translate('scenario.editor.modePresenter'));
  expect(container?.textContent).toContain('00:00');
});

it('opens audience screen only after saving the current project', async () => {
  const saveProject = vi.fn(async (project: ReturnType<typeof createPresentationProject>) => ({
    ...project,
    updatedAt: 4242,
  }));
  renderShellWithSave(saveProject);

  clickButton(translate('scenario.editor.modePresenter'));
  await clickButtonAsync(translate('scenario.editor.openAudienceScreen'));
  clickButton(translate('scenario.editor.next'));

  expect(saveProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Presentation deck' }));
  expect(createPresentationSessionMock).toHaveBeenCalledWith(
    'project-1',
    { clickIndex: 2, slideId: 'slide-1' },
    4242
  );
  expect(updatePresentationPositionMock).toHaveBeenLastCalledWith(
    'session-1',
    { clickIndex: 0, slideId: 'slide-2' },
    4242
  );
  expect(openScenarioAudiencePageMock).toHaveBeenCalledWith(expect.any(String), 'session-1');
  const saveOrder = saveProject.mock.invocationCallOrder[0];
  const openOrder = openScenarioAudiencePageMock.mock.invocationCallOrder[0];
  expect(saveOrder).toBeDefined();
  expect(openOrder).toBeDefined();
  expect(saveOrder as number).toBeLessThan(openOrder as number);
});

it('surfaces audience launch failures without opening a window', async () => {
  const saveProject = vi.fn().mockRejectedValue(new Error('Save failed'));
  renderShellWithSave(saveProject);

  clickButton(translate('scenario.editor.modePresenter'));
  await clickButtonAsync(translate('scenario.editor.openAudienceScreen'));

  expect(openScenarioAudiencePageMock).not.toHaveBeenCalled();
  expect(container?.textContent).toContain(translate('scenario.editor.openAudienceScreenFailed'));
});

it('does not write presentation position before an audience session exists', () => {
  renderShell();

  clickButton(translate('scenario.editor.modePresenter'));
  clickButton(translate('scenario.editor.next'));

  expect(updatePresentationPositionMock).not.toHaveBeenCalled();
});

it('reuses the audience session when opening the audience screen again', async () => {
  renderShell();

  clickButton(translate('scenario.editor.modePresenter'));
  await clickButtonAsync(translate('scenario.editor.openAudienceScreen'));
  await clickButtonAsync(translate('scenario.editor.openAudienceScreen'));

  expect(createPresentationSessionMock).toHaveBeenCalledTimes(1);
  expect(updatePresentationPositionMock).toHaveBeenCalledWith(
    'session-1',
    { clickIndex: 2, slideId: 'slide-1' },
    expect.any(Number)
  );
});

it('writes presenter navigation updates and ends the session on exit', async () => {
  renderShell();

  clickButton(translate('scenario.editor.modePresenter'));
  await clickButtonAsync(translate('scenario.editor.openAudienceScreen'));
  clickButton(translate('scenario.editor.next'));
  clickButton(translate('scenario.editor.exitPresentation'));

  expect(updatePresentationPositionMock).toHaveBeenLastCalledWith(
    'session-1',
    { clickIndex: 0, slideId: 'slide-2' },
    expect.any(Number)
  );
  expect(endPresentationSessionMock).toHaveBeenCalledWith('session-1');
});

function renderShellWithSave(
  saveProject: (
    project: ReturnType<typeof createPresentationProject>
  ) => Promise<ReturnType<typeof createPresentationProject>>
) {
  const project = createPresentationProject();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioV3EditorShell
        project={project}
        onProjectChange={vi.fn()}
        saveProject={saveProject}
      />
    );
  });
}

function createPresentationProject() {
  const project = createScenarioProjectV3('Presentation deck');
  return {
    ...project,
    id: 'project-1',
    slides: [
      createScenarioSlide({
        clicks: { count: 2, initialIndex: 0 },
        id: 'slide-1',
        title: 'First',
      }),
      createScenarioSlide({
        clicks: { count: 1, initialIndex: 0 },
        id: 'slide-2',
        title: 'Second',
      }),
    ],
  };
}

async function clickButtonAsync(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
    await Promise.resolve();
  });
}
