// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listScenarioProjectSummariesMock } = vi.hoisted(() => ({
  listScenarioProjectSummariesMock: vi.fn(),
}));

vi.mock('../../composition/persistence/scenario/store/project-records/index', () => ({
  listScenarioProjectSummaries: listScenarioProjectSummariesMock,
}));

import { useGalleryScenarioProjectsState } from './useGalleryScenarioProjectsState';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function HookProbe(props: {
  onValue: (value: ReturnType<typeof useGalleryScenarioProjectsState>) => void;
}) {
  props.onValue(useGalleryScenarioProjectsState());
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function verifyProjectLoad() {
  let resolveProjects: ((value: unknown) => void) | null = null;
  listScenarioProjectSummariesMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveProjects = resolve;
    })
  );

  const values: unknown[] = [];
  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });
  act(() => {
    resolveProjects?.([{ id: 'project-1', name: 'Scenario', createdAt: 1, updatedAt: 2 }]);
  });
  await flushMicrotasks();

  expect(values.at(-1)).toEqual(
    expect.objectContaining({
      refresh: expect.any(Function),
      scenarioProjects: [{ id: 'project-1', name: 'Scenario', createdAt: 1, updatedAt: 2 }],
    })
  );
}

function verifyStaleUpdateIgnore() {
  let resolveProjects: ((value: unknown) => void) | null = null;
  listScenarioProjectSummariesMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveProjects = resolve;
    })
  );
  act(() => {
    root?.render(<HookProbe onValue={() => undefined} />);
  });
  act(() => {
    root?.unmount();
  });
  act(() => {
    resolveProjects?.([{ id: 'project-2', name: 'Later', createdAt: 2, updatedAt: 3 }]);
  });
}

async function verifyProjectRefresh() {
  listScenarioProjectSummariesMock
    .mockResolvedValueOnce([{ id: 'project-1', name: 'One', createdAt: 1, updatedAt: 2 }])
    .mockResolvedValueOnce([{ id: 'project-2', name: 'Two', createdAt: 3, updatedAt: 4 }]);

  const values: {
    refresh: () => void;
    scenarioProjects: { id: string; name: string; createdAt: number; updatedAt: number }[];
  }[] = [];
  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });
  await flushMicrotasks();

  const latestValue = values.at(-1);
  if (!latestValue) {
    throw new Error('Expected scenario projects state');
  }

  act(() => {
    latestValue.refresh();
  });
  await flushMicrotasks();

  expect(values.at(-1)?.scenarioProjects).toEqual([
    { id: 'project-2', name: 'Two', createdAt: 3, updatedAt: 4 },
  ]);
}

describe('useGalleryScenarioProjectsState', () => {
  it('loads scenario projects', verifyProjectLoad);
  it('ignores stale updates after unmount', verifyStaleUpdateIgnore);
  it('refreshes the scenario list on demand', verifyProjectRefresh);
});
