// @vitest-environment jsdom

import { act, useRef, useState, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

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

import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { useScenarioV3ProjectSaver } from './use-save';
import type { ScenarioV3PageSaveState } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let currentSaveProject: ((project: ScenarioProjectV3) => Promise<void>) | null = null;

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
  vi.unstubAllGlobals();
});

describe('useScenarioV3ProjectSaver', () => {
  it(
    'ignores stale save failures that complete after a newer successful save',
    verifyStaleSaveFailureIgnoredAfterNewerSuccess
  );
  it('surfaces the latest save failure', verifyLatestSaveFailureSurfaced);
  it(
    'queues a newer local save on the prior persisted revision',
    verifyQueuedSaveUsesPersistedRevision
  );
  it('updates the saved baseline after the latest successful save', verifySavedBaselineAdvances);
  it('keeps the saved baseline when a stale save is rejected', verifyStaleSaveKeepsBaseline);
  it('rethrows strict save failures for caller-owned compensation', verifyStrictSaveRethrows);
});

async function verifyStaleSaveFailureIgnoredAfterNewerSuccess() {
  const first = createDeferred<ScenarioProjectV3>();
  const second = createDeferred<ScenarioProjectV3>();
  const setError = vi.fn();
  const setSaveState = vi.fn();
  saveScenarioProjectRecordV3Mock
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  renderSaver({ setError, setSaveState });

  await clickSave();
  await clickSave();
  await act(async () => {
    second.resolve(createScenarioProjectV3('Second'));
    await second.promise;
    first.reject(new Error('Old failure'));
    await first.promise.catch(() => undefined);
  });

  expect(setError).not.toHaveBeenCalledWith('Old failure');
  expect(setSaveState).toHaveBeenLastCalledWith('saved');
}

async function verifyLatestSaveFailureSurfaced() {
  const setError = vi.fn();
  const setSaveState = vi.fn();
  saveScenarioProjectRecordV3Mock.mockRejectedValue(new Error('Quota exceeded'));
  renderSaver({ setError, setSaveState });

  await clickSave();

  expect(setError).toHaveBeenCalledWith('Quota exceeded');
  expect(setSaveState).toHaveBeenLastCalledWith('error');
}

async function verifyQueuedSaveUsesPersistedRevision() {
  const savedProject = withUpdatedAt(createScenarioProjectV3('Saved'), 10);
  const savedProjectRef: MutableRefObject<ScenarioProjectV3 | null> = { current: savedProject };
  const firstSave = createDeferred<ScenarioProjectV3>();
  const secondSave = createDeferred<ScenarioProjectV3>();
  const setSaveState = vi.fn();
  const firstProject = { ...savedProject, name: 'First local edit', updatedAt: 11 };
  const secondProject = { ...savedProject, name: 'Second local edit', updatedAt: 12 };
  saveScenarioProjectRecordV3Mock
    .mockReturnValueOnce(firstSave.promise)
    .mockReturnValueOnce(secondSave.promise);
  renderSaver({ savedProjectRef, setSaveState });

  const firstSavePromise = requestSave(firstProject);
  const secondSavePromise = requestSave(secondProject);

  expect(saveScenarioProjectRecordV3Mock).toHaveBeenCalledTimes(1);
  expectSaveCalledWithBaseAndName(1, 10, 'First local edit');

  await act(async () => {
    firstSave.resolve({ ...firstProject, updatedAt: 20 });
    await firstSavePromise;
    await flushMicrotasks();
  });

  expectSaveCalledWithBaseAndName(2, 20, 'Second local edit');

  await act(async () => {
    secondSave.resolve({ ...secondProject, updatedAt: 30 });
    await secondSavePromise;
  });

  expect(savedProjectRef.current).toEqual(expect.objectContaining({ updatedAt: 30 }));
  expect(setSaveState).toHaveBeenLastCalledWith('saved');
}

async function verifySavedBaselineAdvances() {
  const savedProject = withUpdatedAt(createScenarioProjectV3('Saved'), 10);
  saveScenarioProjectRecordV3Mock
    .mockResolvedValueOnce(withUpdatedAt(createScenarioProjectV3('First save'), 20))
    .mockResolvedValueOnce(withUpdatedAt(createScenarioProjectV3('Second save'), 30));
  renderSaver({ savedProject });

  await clickSave();
  await clickSave();

  expectSaveCalledWithBaseAndName(1, 10, 'Saved');
  expectSaveCalledWithBaseAndName(2, 20, 'Saved');
}

async function verifyStaleSaveKeepsBaseline() {
  const savedProject = withUpdatedAt(createScenarioProjectV3('Saved'), 10);
  const setError = vi.fn();
  saveScenarioProjectRecordV3Mock
    .mockRejectedValueOnce(new Error('Scenario project changed before save completed'))
    .mockResolvedValueOnce(withUpdatedAt(createScenarioProjectV3('Retry save'), 20));
  renderSaver({ savedProject, setError });

  await clickSave();
  await clickSave();

  expect(setError).toHaveBeenCalledWith('Scenario project changed before save completed');
  expectSaveCalledWithBaseAndName(1, 10, 'Saved');
  expectSaveCalledWithBaseAndName(2, 10, 'Saved');
}

async function verifyStrictSaveRethrows() {
  const setError = vi.fn();
  const setSaveState = vi.fn();
  saveScenarioProjectRecordV3Mock.mockRejectedValue(new Error('Quota exceeded'));
  renderSaver({ setError, setSaveState });

  await clickStrictSave();

  expect(container?.textContent).toContain('Quota exceeded');
  expect(setError).toHaveBeenCalledWith('Quota exceeded');
  expect(setSaveState).toHaveBeenLastCalledWith('error');
}

function expectSaveCalledWithBaseAndName(call: number, baseUpdatedAt: number, name: string) {
  expect(saveScenarioProjectRecordV3Mock).toHaveBeenNthCalledWith(
    call,
    expect.objectContaining({ name }),
    { baseUpdatedAt }
  );
}

function renderSaver(overrides: Partial<SaverHarnessProps> = {}) {
  act(() => {
    root?.render(<SaverHarness {...overrides} />);
  });
}

interface SaverHarnessProps {
  savedProject: ScenarioProjectV3 | null;
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  setError: (error: string | null) => void;
  setProject: (project: ScenarioProjectV3) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
}

function SaverHarness(props: Partial<SaverHarnessProps>) {
  const localSavedProjectRef = useRef<ScenarioProjectV3 | null>(props.savedProject ?? null);
  const savedProjectRef = props.savedProjectRef ?? localSavedProjectRef;
  const saveRevisionRef = useRef(0);
  const { saveProject, saveProjectOrThrow } = useScenarioV3ProjectSaver({
    savedProjectRef,
    saveRevisionRef,
    setError: props.setError ?? vi.fn(),
    setProject: props.setProject ?? vi.fn(),
    setSaveState: props.setSaveState ?? vi.fn(),
  });
  currentSaveProject = saveProject;
  const [strictError, setStrictError] = useState<string | null>(null);

  return (
    <div>
      <button type="button" onClick={() => void saveProject(createScenarioProjectV3('Saved'))}>
        save
      </button>
      <button
        type="button"
        onClick={() =>
          void saveProjectOrThrow(createScenarioProjectV3('Strict')).catch((error: unknown) =>
            setStrictError(error instanceof Error ? error.message : 'strict failed')
          )
        }
      >
        strict save
      </button>
      {strictError}
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

async function clickStrictSave() {
  await clickButtonByText('strict save');
}

async function clickButtonByText(text: string) {
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const button = buttons.find((candidate) => candidate.textContent?.trim() === text);
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
    await Promise.resolve();
  });
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
