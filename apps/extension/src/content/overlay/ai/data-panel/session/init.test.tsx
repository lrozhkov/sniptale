// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const { loadSpoilerStateMock } = vi.hoisted(() => ({
  loadSpoilerStateMock: vi.fn(),
}));

vi.mock('../../persistence/spoiler-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/spoiler-state')>()),
  loadSpoilerState: loadSpoilerStateMock,
}));

import { useTreeDataInitialization } from './init';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const sampleTreeData = {
  context: 'Issue details',
  title: 'AI picker',
  structure: [
    {
      children: [
        {
          id: 'field-1',
          label: 'Status',
          selected: true,
          type: 'field',
          value: 'Open',
          valueType: 'string',
        },
      ],
      id: 'section-1',
      selected: true,
      title: 'Section',
      type: 'section',
    },
  ],
} satisfies ParsedDOMTree;

function createProps(overrides: Partial<Parameters<typeof useTreeDataInitialization>[0]> = {}) {
  return {
    onSelectedDataChange: vi.fn(),
    setExcludedColumns: vi.fn(),
    setIsDataSpoilerOpen: vi.fn(),
    setTreeState: vi.fn(),
    treeData: sampleTreeData,
    ...overrides,
  };
}

function TreeInitHarness(props: Parameters<typeof useTreeDataInitialization>[0]) {
  useTreeDataInitialization(props);
  return null;
}

async function renderHarness(props: Parameters<typeof useTreeDataInitialization>[0]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<TreeInitHarness {...props} />);
    await Promise.resolve();
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  loadSpoilerStateMock.mockReset();
  loadSpoilerStateMock.mockResolvedValue(true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('useTreeDataInitialization', () => {
  it('initializes tree state and spoiler state when tree data is present', async () => {
    const props = createProps();

    await renderHarness(props);

    expect(props.setTreeState).toHaveBeenCalledWith(
      new Map([
        ['section-1', { expanded: true, id: 'section-1', selected: true }],
        ['field-1', { expanded: true, id: 'field-1', selected: true }],
      ])
    );
    expect(props.setExcludedColumns).toHaveBeenCalledWith(new Map());
    expect(props.setIsDataSpoilerOpen).toHaveBeenCalledWith(true);
  });

  it('clears tree-bound state and selected data when tree data is missing', async () => {
    const props = createProps({ treeData: null });

    await renderHarness(props);

    expect(props.setTreeState).toHaveBeenCalledWith(new Map());
    expect(props.setExcludedColumns).toHaveBeenCalledWith(new Map());
    expect(props.onSelectedDataChange).toHaveBeenCalledWith('');
  });
});
