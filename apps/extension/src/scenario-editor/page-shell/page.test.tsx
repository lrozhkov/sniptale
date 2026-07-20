// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

const {
  createScenarioProjectRecordV3Mock,
  getScenarioProjectRecordV3Mock,
  listScenarioProjectSummariesV3Mock,
  readScenarioEditorPresentationSessionIdMock,
  readScenarioEditorPresentationViewMock,
  readScenarioEditorProjectIdMock,
  readScenarioEditorStepIdMock,
  replaceScenarioEditorSelectionInUrlMock,
  saveScenarioProjectRecordV3Mock,
  scenarioShellPropsMock,
} = vi.hoisted(() => ({
  createScenarioProjectRecordV3Mock: vi.fn(),
  getScenarioProjectRecordV3Mock: vi.fn(),
  listScenarioProjectSummariesV3Mock: vi.fn(),
  readScenarioEditorPresentationSessionIdMock: vi.fn(),
  readScenarioEditorPresentationViewMock: vi.fn(),
  readScenarioEditorProjectIdMock: vi.fn(),
  readScenarioEditorStepIdMock: vi.fn(),
  replaceScenarioEditorSelectionInUrlMock: vi.fn(),
  saveScenarioProjectRecordV3Mock: vi.fn(),
  scenarioShellPropsMock: vi.fn(),
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/runtime-contracts/scenario-editor/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/runtime-contracts/scenario-editor/session')>()),
  readScenarioEditorPresentationSessionId: readScenarioEditorPresentationSessionIdMock,
  readScenarioEditorPresentationView: readScenarioEditorPresentationViewMock,
  readScenarioEditorProjectId: readScenarioEditorProjectIdMock,
  readScenarioEditorStepId: readScenarioEditorStepIdMock,
}));
vi.mock('../../composition/persistence/scenario/store/v3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/scenario/store/v3')>()),
  createScenarioProjectRecordV3: createScenarioProjectRecordV3Mock,
  getScenarioProjectRecordV3: getScenarioProjectRecordV3Mock,
  listScenarioProjectSummariesV3: listScenarioProjectSummariesV3Mock,
  saveScenarioProjectRecordV3: saveScenarioProjectRecordV3Mock,
}));
vi.mock('../platform/browser-driver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/browser-driver')>()),
  replaceScenarioEditorSelectionInUrl: replaceScenarioEditorSelectionInUrlMock,
}));
vi.mock('./view', () => ({
  ScenarioV3EditorShell: (props: {
    onProjectChange?: (project: ScenarioProjectV3) => void;
    project: ScenarioProjectV3;
    saveStatus?: {
      error: string | null;
      retrySave: () => Promise<void>;
      state: string;
    };
  }) => (
    scenarioShellPropsMock(props),
    (
      <div data-testid="scenario-v3-shell">
        <span>{props.project.name}</span>
        <button
          type="button"
          aria-label="Mutate project"
          onClick={() => props.onProjectChange?.({ ...props.project, name: 'Changed' })}
        >
          mutate
        </button>
        {props.saveStatus?.state === 'error' ? (
          <button type="button" onClick={() => void props.saveStatus?.retrySave()}>
            {props.saveStatus.error}
          </button>
        ) : null}
      </div>
    )
  ),
}));
vi.mock('./presentation/audience', () => ({
  ScenarioAudiencePresentationPage: (props: {
    project: ScenarioProjectV3;
    sessionId: string | null;
  }) => (
    <div data-testid="scenario-audience-page">
      {props.project.name}:{props.sessionId}
    </div>
  ),
}));

import { createScenarioProjectV3 } from '../../features/scenario/project/v3';
import { ScenarioV3EditorPage } from './page';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  readScenarioEditorProjectIdMock.mockReturnValue(null);
  readScenarioEditorPresentationSessionIdMock.mockReturnValue(null);
  readScenarioEditorPresentationViewMock.mockReturnValue(null);
  readScenarioEditorStepIdMock.mockReturnValue(null);
  getScenarioProjectRecordV3Mock.mockResolvedValue(undefined);
  listScenarioProjectSummariesV3Mock.mockResolvedValue([]);
  createScenarioProjectRecordV3Mock.mockResolvedValue(createScenarioProjectV3('Created'));
  saveScenarioProjectRecordV3Mock.mockResolvedValue(undefined);
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

describe('ScenarioV3EditorPage', () => {
  it('creates and routes to a v3 project when no stored project exists', async () => {
    await renderPage();

    expect(container?.textContent).toContain('Created');
    expect(createScenarioProjectRecordV3Mock).toHaveBeenCalledWith(
      'scenario.editor.v3UntitledProject'
    );
    expect(replaceScenarioEditorSelectionInUrlMock).toHaveBeenCalledWith({
      projectId: expect.any(String),
    });
  });

  it('loads the requested v3 project from the editor URL', async () => {
    const requestedProject = createScenarioProjectV3('Requested');
    readScenarioEditorProjectIdMock.mockReturnValue('project-1');
    getScenarioProjectRecordV3Mock.mockResolvedValue(requestedProject);

    await renderPage();

    expect(container?.textContent).toContain('Requested');
    expect(getScenarioProjectRecordV3Mock).toHaveBeenCalledWith('project-1');
  });

  it('routes audience query loads to the read-only audience page', async () => {
    const requestedProject = createScenarioProjectV3('Audience');
    readScenarioEditorProjectIdMock.mockReturnValue('project-1');
    readScenarioEditorPresentationViewMock.mockReturnValue('audience');
    readScenarioEditorPresentationSessionIdMock.mockReturnValue('session-1');
    getScenarioProjectRecordV3Mock.mockResolvedValue(requestedProject);

    await renderPage();

    expect(container?.querySelector('[data-testid="scenario-audience-page"]')).not.toBeNull();
    expect(container?.querySelector('[data-testid="scenario-v3-shell"]')).toBeNull();
    expect(container?.textContent).toContain('Audience:session-1');
  });
});

describe('ScenarioV3EditorPage failure states', () => {
  it('surfaces bootstrap failure and retries the load path', async () => {
    createScenarioProjectRecordV3Mock
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce(createScenarioProjectV3('Recovered'));

    await renderPage();
    expect(container?.textContent).toContain('IndexedDB unavailable');

    await clickButtonText('scenario.editor.v3Retry');
    expect(container?.textContent).toContain('Recovered');
  });

  it('surfaces save failure and retries without discarding local project state', async () => {
    saveScenarioProjectRecordV3Mock
      .mockRejectedValueOnce(new Error('Quota exceeded'))
      .mockImplementationOnce(async (project) => project);
    await renderPage();

    await clickButton('Mutate project');
    expect(container?.textContent).toContain('Changed');
    expect(container?.textContent).toContain('Quota exceeded');
    expect(scenarioShellPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        saveStatus: expect.objectContaining({ error: 'Quota exceeded', state: 'error' }),
      })
    );

    await clickButtonText('Quota exceeded');
    expect(saveScenarioProjectRecordV3Mock).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Changed' }),
      { baseUpdatedAt: expect.any(Number) }
    );
  });

  it('keeps the saved autosave badge hidden on the editor page', async () => {
    await renderPage();

    await clickButton('Mutate project');

    expect(container?.textContent).not.toContain('scenario.editor.savedStatus');
  });
});

async function renderPage() {
  await act(async () => {
    root?.render(<ScenarioV3EditorPage />);
    await flushEffects();
  });
}

async function clickButton(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
    await flushEffects();
  });
}

async function clickButtonText(text: string) {
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const button = buttons.find((candidate) => candidate.textContent?.trim() === text);
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
    await flushEffects();
  });
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
