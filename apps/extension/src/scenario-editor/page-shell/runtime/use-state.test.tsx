// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';

const { loadProjectMock, readScenarioEditorProjectIdMock, saveProjectMock } = vi.hoisted(() => ({
  loadProjectMock: vi.fn(),
  readScenarioEditorProjectIdMock: vi.fn(),
  saveProjectMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));
vi.mock('@sniptale/runtime-contracts/scenario-editor/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/runtime-contracts/scenario-editor/session')>()),
  readScenarioEditorProjectId: readScenarioEditorProjectIdMock,
}));
vi.mock('./use-load', () => ({
  useScenarioV3ProjectLoader: () => ({ loadProject: loadProjectMock }),
}));
vi.mock('./use-save', () => ({
  useScenarioV3ProjectSaver: () => ({
    saveProject: saveProjectMock,
    saveProjectOrThrow: saveProjectMock,
  }),
}));

import { useScenarioV3PageProjectState } from './use-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  readScenarioEditorProjectIdMock.mockReturnValue(null);
  loadProjectMock.mockResolvedValue(undefined);
  saveProjectMock.mockResolvedValue(undefined);
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

describe('useScenarioV3PageProjectState', () => {
  it('keeps retry-save as a no-op until a project is loaded', async () => {
    renderHarness();

    await clickButton('Retry save');

    expect(saveProjectMock).not.toHaveBeenCalled();
    expect(loadProjectMock).toHaveBeenCalledTimes(1);
  });

  it('saves updated projects and retries the latest local project snapshot', async () => {
    renderHarness();

    await clickButton('Update project');
    await clickButton('Retry save');

    expect(saveProjectMock).toHaveBeenCalledTimes(2);
    expect(saveProjectMock).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Updated' }));
  });

  it('exposes strict save for presenter launch flows', async () => {
    renderHarness();

    await clickButton('Save now');

    expect(saveProjectMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated' }));
  });
});

function renderHarness() {
  act(() => {
    root?.render(<RuntimeHarness />);
  });
}

function RuntimeHarness() {
  const state = useScenarioV3PageProjectState();
  const project = createScenarioProjectV3('Updated');

  return (
    <div>
      <button type="button" onClick={() => void state.retrySave()}>
        Retry save
      </button>
      <button type="button" onClick={() => state.updateProject(project)}>
        Update project
      </button>
      <button type="button" onClick={() => void state.saveProject(project)}>
        Save now
      </button>
    </div>
  );
}

async function clickButton(label: string) {
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
    await Promise.resolve();
  });
}
