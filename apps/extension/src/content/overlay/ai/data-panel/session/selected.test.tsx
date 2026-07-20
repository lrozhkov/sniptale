// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { useSelectedDataState } from './selected';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useSelectedDataState> | null = null;

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
} as unknown as ParsedDOMTree;

function SelectedStateHarness(props: Parameters<typeof useSelectedDataState>[0]) {
  latestState = useSelectedDataState(props);
  return null;
}

async function renderHarness(props: Parameters<typeof useSelectedDataState>[0]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<SelectedStateHarness {...props} />);
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
});

describe('useSelectedDataState', () => {
  it('derives selected data, formatted json, and aggregate flags from tree state', async () => {
    await renderHarness({
      excludedColumns: new Map(),
      treeData: sampleTreeData,
      treeState: new Map([
        ['section-1', { expanded: true, id: 'section-1', selected: true }],
        ['field-1', { expanded: false, id: 'field-1', selected: true }],
      ]),
    });

    expect(latestState?.selectedData).toContain('"n":"Status"');
    expect(latestState?.formattedJSON).toContain('"n": "Status"');
    expect(latestState?.isAnySelected).toBe(true);
    expect(latestState?.isAnyExpanded).toBe(true);
    expect(latestState?.spoilerSummary).not.toBe('');
  });

  it('returns empty-safe derived state when no tree data is available', async () => {
    await renderHarness({
      excludedColumns: new Map(),
      treeData: null,
      treeState: new Map(),
    });

    expect(latestState).toEqual({
      formattedJSON: '',
      isAnyExpanded: false,
      isAnySelected: false,
      selectedData: '',
      spoilerSummary: '',
    });
  });
});
