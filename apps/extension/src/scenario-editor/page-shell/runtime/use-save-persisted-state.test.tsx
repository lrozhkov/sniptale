// @vitest-environment jsdom

import { act, useRef, useState, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { useScenarioV3ProjectSaver } from './use-save';

const { saveScenarioProjectRecordV3Mock } = vi.hoisted(() => ({
  saveScenarioProjectRecordV3Mock: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/store/v3', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../composition/persistence/scenario/store/v3')>();
  return {
    ...actual,
    saveScenarioProjectRecordV3: saveScenarioProjectRecordV3Mock,
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let currentSaveProject: ((project: ScenarioProjectV3) => Promise<void>) | null = null;
let currentStrictSaveProject: ((project: ScenarioProjectV3) => Promise<ScenarioProjectV3>) | null =
  null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
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
  currentSaveProject = null;
  currentStrictSaveProject = null;
  vi.unstubAllGlobals();
});

describe('useScenarioV3ProjectSaver persisted project state', () => {
  it('applies the persisted latest save to visible project state', verifyPersistedSaveApplied);
  it(
    'does not overwrite newer visible state with an older persisted save',
    verifyStaleSaveDoesNotOverwriteVisibleState
  );
  it('returns the persisted project from strict saves', verifyStrictSaveReturnsPersistedProject);
});

async function verifyPersistedSaveApplied() {
  saveScenarioProjectRecordV3Mock.mockResolvedValue(
    withUpdatedAt(createScenarioProjectV3('Persisted save'), 40)
  );
  renderSaver();

  await clickSave();

  expect(container?.textContent).toContain('Persisted save:40');
}

async function verifyStaleSaveDoesNotOverwriteVisibleState() {
  const savedProject = withUpdatedAt(createScenarioProjectV3('Saved'), 10);
  const firstSave = createDeferred<ScenarioProjectV3>();
  const secondSave = createDeferred<ScenarioProjectV3>();
  const firstProject = { ...savedProject, name: 'First local edit', updatedAt: 11 };
  const secondProject = { ...savedProject, name: 'Second local edit', updatedAt: 12 };
  saveScenarioProjectRecordV3Mock
    .mockReturnValueOnce(firstSave.promise)
    .mockReturnValueOnce(secondSave.promise);
  renderSaver({ savedProject });

  const firstSavePromise = requestSave(firstProject);
  const secondSavePromise = requestSave(secondProject);

  await act(async () => {
    firstSave.resolve({ ...firstProject, name: 'First persisted', updatedAt: 20 });
    await firstSavePromise;
    await flushMicrotasks();
  });

  expect(container?.textContent).not.toContain('First persisted:20');

  await act(async () => {
    secondSave.resolve({ ...secondProject, name: 'Second persisted', updatedAt: 30 });
    await secondSavePromise;
  });

  expect(container?.textContent).toContain('Second persisted:30');
}

async function verifyStrictSaveReturnsPersistedProject() {
  const project = withUpdatedAt(createScenarioProjectV3('Strict local'), 10);
  const persistedProject = { ...project, name: 'Strict persisted', updatedAt: 20 };
  saveScenarioProjectRecordV3Mock.mockResolvedValue(persistedProject);
  renderSaver();

  const result = await requestStrictSave(project);

  expect(result).toBe(persistedProject);
  expect(container?.textContent).toContain('Strict persisted:20');
}

function renderSaver(overrides: Partial<SaverHarnessProps> = {}) {
  act(() => {
    root?.render(<SaverHarness {...overrides} />);
  });
}

interface SaverHarnessProps {
  savedProject: ScenarioProjectV3 | null;
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
}

function SaverHarness(props: Partial<SaverHarnessProps>) {
  const localSavedProjectRef = useRef<ScenarioProjectV3 | null>(props.savedProject ?? null);
  const savedProjectRef = props.savedProjectRef ?? localSavedProjectRef;
  const saveRevisionRef = useRef(0);
  const [visibleProject, setVisibleProject] = useState<ScenarioProjectV3 | null>(
    props.savedProject ?? null
  );
  const { saveProject, saveProjectOrThrow } = useScenarioV3ProjectSaver({
    savedProjectRef,
    saveRevisionRef,
    setError: vi.fn(),
    setProject: setVisibleProject,
    setSaveState: vi.fn(),
  });
  currentSaveProject = saveProject;
  currentStrictSaveProject = saveProjectOrThrow;

  return (
    <div>
      <output>
        {visibleProject ? `${visibleProject.name}:${visibleProject.updatedAt}` : 'no project'}
      </output>
      <button type="button" onClick={() => void saveProject(createScenarioProjectV3('Saved'))}>
        save
      </button>
    </div>
  );
}

async function clickSave() {
  const button = container?.querySelector<HTMLButtonElement>('button');
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
    await Promise.resolve();
  });
}

function requestSave(project: ScenarioProjectV3) {
  expect(currentSaveProject).not.toBeNull();
  let savePromise!: Promise<void>;
  act(() => {
    savePromise = currentSaveProject?.(project) ?? Promise.reject(new Error('missing saver'));
  });
  return savePromise;
}

async function requestStrictSave(project: ScenarioProjectV3) {
  expect(currentStrictSaveProject).not.toBeNull();
  let result!: ScenarioProjectV3;
  await act(async () => {
    result = await (currentStrictSaveProject?.(project) ??
      Promise.reject(new Error('missing strict saver')));
  });
  return result;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function withUpdatedAt(project: ScenarioProjectV3, updatedAt: number): ScenarioProjectV3 {
  return { ...project, updatedAt };
}
