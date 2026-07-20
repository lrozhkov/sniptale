// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioProjectV3, createScenarioSlide } from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';

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

vi.mock('./page', () => ({
  ScenarioV3EditorPage: () => <div data-testid="scenario-v3-page">v3 page</div>,
}));
vi.mock('../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/ai-settings/query')>()),
  requestAIModelSelectionBootstrap: vi.fn(async () => ({
    defaultModelId: 'model-1',
    models: [],
    providers: [],
  })),
}));
vi.mock('../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/navigation/extension-pages')>()),
  openScenarioAudiencePage: openScenarioAudiencePageMock,
}));
vi.mock('./presentation/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./presentation/session')>()),
  createScenarioPresentationSession: createPresentationSessionMock,
  endScenarioPresentationSession: endPresentationSessionMock,
  updateScenarioPresentationPosition: updatePresentationPositionMock,
}));

import { ScenarioEditorPage } from './ScenarioEditorPage';
import { ScenarioV3EditorShell } from './view';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  createPresentationSessionMock.mockResolvedValue({ sessionId: 'session-1' });
  updatePresentationPositionMock.mockImplementation(async (sessionId, position) => ({
    ...position,
    sessionId,
    status: 'active',
  }));
  openScenarioAudiencePageMock.mockResolvedValue(undefined);
  endPresentationSessionMock.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ScenarioEditorPage', () => {
  registerPageRouteTest();
  registerFloatingToolRouteTest();
  registerPresenterSessionTest();
});

function registerPageRouteTest() {
  it('routes the production scenario editor page to the v3 slide canvas editor', () => {
    act(() => {
      root?.render(<ScenarioEditorPage />);
    });

    expect(container?.querySelector('[data-testid="scenario-v3-page"]')).not.toBeNull();
  });
}

function registerFloatingToolRouteTest() {
  it('routes v3 shell floating tools through their canonical panels', () => {
    const retrySave = vi.fn(async () => undefined);
    act(() => {
      root?.render(
        <ScenarioV3EditorShell
          project={createScenarioProjectV3('Inspector route')}
          saveStatus={{ error: 'Quota exceeded', retrySave, state: 'error' }}
        />
      );
    });

    expect(container?.textContent).toContain('Quota exceeded');
    const gridButton = getButton(translate('scenario.editor.toggleGrid'));
    expect(gridButton?.getAttribute('data-ui')).toBe('scenario.floating.workspace-panel.grid');
    expect(gridButton?.getAttribute('aria-pressed')).toBe('true');
    clickButton(translate('scenario.editor.toggleGrid'));
    expect(getButton(translate('scenario.editor.toggleGrid'))?.getAttribute('aria-pressed')).toBe(
      null
    );

    clickButton(translate('scenario.editor.export'));
    expect(container?.querySelector('[data-ui="scenario.inspector.export-tool"]')).not.toBeNull();
  });
}

function registerPresenterSessionTest() {
  it('coordinates presenter audience session from the floating chrome route', async () => {
    const project = createScenarioProjectV3('Presenter route');
    const scenarioProject = {
      ...project,
      id: 'project-1',
      slides: [
        createScenarioSlide({ clicks: { count: 1, initialIndex: 0 }, id: 'slide-1' }),
        createScenarioSlide({ clicks: { count: 1, initialIndex: 0 }, id: 'slide-2' }),
      ],
    };
    const saveProject = vi.fn(async () => scenarioProject);

    act(() => {
      root?.render(<ScenarioV3EditorShell project={scenarioProject} saveProject={saveProject} />);
    });

    clickButton(translate('scenario.editor.modePresenter'));
    await clickButtonAsync(translate('scenario.editor.openAudienceScreen'));
    clickButton(translate('scenario.editor.next'));
    clickButton(translate('scenario.editor.exitPresentation'));

    expect(saveProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1' }));
    expect(createPresentationSessionMock).toHaveBeenCalledWith(
      'project-1',
      { clickIndex: 1, slideId: 'slide-1' },
      expect.any(Number)
    );
    expect(openScenarioAudiencePageMock).toHaveBeenCalledWith('project-1', 'session-1');
    expect(updatePresentationPositionMock).toHaveBeenCalledWith(
      'session-1',
      { clickIndex: 0, slideId: 'slide-2' },
      expect.any(Number)
    );
    expect(endPresentationSessionMock).toHaveBeenCalledWith('session-1');
  });
}

function clickButton(label: string) {
  const button = getButton(label);
  expect(button).not.toBeNull();
  act(() => button?.click());
}

function getButton(label: string) {
  return container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"], [title="${label}"]`);
}

async function clickButtonAsync(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
    await Promise.resolve();
  });
}
