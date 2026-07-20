// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVideoEditorLibraries } from './libraries';

const { listProjectExports, listRecordings, listVideoProjects } = vi.hoisted(() => ({
  listProjectExports: vi.fn(),
  listRecordings: vi.fn(),
  listVideoProjects: vi.fn(),
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  listProjectExports,
  listVideoProjects,
}));

vi.mock('../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/index')>()),
  listRecordings,
}));

function createDeferred<T>() {
  let rejectPromise: (error: unknown) => void;
  let resolvePromise: (value: T) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise!,
    resolve: resolvePromise!,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useVideoEditorLibraries> | null = null;

function Harness() {
  latestState = useVideoEditorLibraries();
  return null;
}

function getState() {
  if (!latestState) {
    throw new Error('Libraries state is not ready');
  }

  return latestState;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  listProjectExports.mockReset();
  listRecordings.mockReset();
  listVideoProjects.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
});

it('ignores stale project export refresh results after a newer project request starts', async () => {
  const projectA = createDeferred<Array<{ id: string; createdAt: number }>>();
  const projectB = createDeferred<Array<{ id: string; createdAt: number }>>();

  listProjectExports.mockImplementationOnce(() => projectA.promise);
  listProjectExports.mockImplementationOnce(() => projectB.promise);

  await act(async () => {
    root?.render(<Harness />);
  });
  await act(async () => {
    void getState().refreshProjectExports('project-a');
    void getState().refreshProjectExports('project-b');
  });
  await act(async () => {
    projectB.resolve([{ id: 'export-b', createdAt: 2 }]);
    await Promise.resolve();
  });
  await act(async () => {
    projectA.resolve([{ id: 'export-a', createdAt: 1 }]);
    await Promise.resolve();
  });

  expect(getState().projectExports).toEqual([{ id: 'export-b', createdAt: 2 }]);
});
