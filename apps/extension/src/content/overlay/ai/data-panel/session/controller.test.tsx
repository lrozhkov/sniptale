// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { useAIModalDataPanelState } from './controller';

const loadSpoilerState = vi.fn().mockResolvedValue(false);
const saveSpoilerState = vi.fn();

vi.mock('../../persistence/spoiler-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/spoiler-state')>()),
  loadSpoilerState: () => loadSpoilerState(),
  saveSpoilerState: (...args: unknown[]) => saveSpoilerState(...args),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const sampleTreeData = {
  context: 'Issue details',
  title: 'AI picker',
  structure: [
    {
      id: 'section-1',
      type: 'section',
      title: 'Section',
      selected: true,
      children: [
        {
          id: 'field-1',
          type: 'field',
          label: 'Status',
          value: 'Open',
          valueType: 'string',
          selected: true,
        },
        {
          id: 'table-1',
          type: 'table',
          headers: ['Name', 'Role'],
          selected: true,
          rows: [
            {
              id: 'row-1',
              selected: false,
              data: {
                Name: 'Alice',
                Role: 'Owner',
              },
              selector: '[data-row="1"]',
            },
          ],
        },
      ],
    },
  ],
} satisfies ParsedDOMTree;

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });

  root = null;
  container?.remove();
  container = null;
  loadSpoilerState.mockClear();
  saveSpoilerState.mockClear();
});

function renderHarness(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(node);
  });
}

function readFlag(selector: string) {
  return container?.querySelector<HTMLElement>(selector)?.dataset['state'];
}

function DataPanelStateHarness(props: {
  onSelectedDataChange: (selectedData: string) => void;
  selectedData: string;
  treeData: ParsedDOMTree;
}) {
  const state = useAIModalDataPanelState(props);
  const tableExpanded = state.treeState.get('table-1')?.expanded ?? false;
  const rowSelected = state.treeState.get('row-1')?.selected ?? false;
  const roleIncluded = state.formattedJSON.includes('"Role": "Owner"');

  return (
    <div>
      <button id="toggle-expanded" onClick={() => state.toggleExpanded('table-1')}>
        toggle expanded
      </button>
      <button id="toggle-selected" onClick={() => state.toggleSelected('row-1')}>
        toggle selected
      </button>
      <button
        id="toggle-role-column"
        onClick={() => state.toggleColumnExclusion('table-1', 'Role')}
      >
        toggle role column
      </button>
      <div data-state={String(tableExpanded)} id="expanded-state" />
      <div data-state={String(rowSelected)} id="selected-state" />
      <div data-state={String(roleIncluded)} id="role-column-state" />
    </div>
  );
}

async function renderDataPanelStateHarness() {
  const onSelectedDataChange = vi.fn();

  renderHarness(
    <DataPanelStateHarness
      treeData={sampleTreeData}
      onSelectedDataChange={onSelectedDataChange}
      selectedData=""
    />
  );

  await act(async () => {
    await Promise.resolve();
  });

  return {
    onSelectedDataChange,
  };
}

function clickHarnessButton(selector: string) {
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>(selector)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function expectExpandedStateToPersist() {
  await renderDataPanelStateHarness();

  expect(readFlag('#expanded-state')).toBe('true');

  clickHarnessButton('#toggle-expanded');

  expect(readFlag('#expanded-state')).toBe('false');
}

async function expectSelectedStateToPropagateJson() {
  const { onSelectedDataChange } = await renderDataPanelStateHarness();

  expect(readFlag('#selected-state')).toBe('false');

  clickHarnessButton('#toggle-selected');

  expect(readFlag('#selected-state')).toBe('true');
  expect(onSelectedDataChange).toHaveBeenLastCalledWith(expect.stringContaining('"Alice"'));
}

async function expectColumnInclusionToPropagateJson() {
  const { onSelectedDataChange } = await renderDataPanelStateHarness();

  clickHarnessButton('#toggle-selected');

  expect(readFlag('#selected-state')).toBe('true');
  expect(readFlag('#role-column-state')).toBe('true');

  clickHarnessButton('#toggle-role-column');

  expect(readFlag('#role-column-state')).toBe('false');
  expect(onSelectedDataChange).toHaveBeenLastCalledWith(
    expect.not.stringContaining('"Role":"Owner"')
  );
  expect(onSelectedDataChange).toHaveBeenLastCalledWith(expect.stringContaining('"Name":"Alice"'));
}

describe('useAIModalDataPanelState', () => {
  it('keeps expanded state after rerender', expectExpandedStateToPersist);

  it(
    'keeps selected state after rerender and propagates updated JSON',
    expectSelectedStateToPropagateJson
  );

  it(
    'propagates updated JSON when table column inclusion changes',
    expectColumnInclusionToPropagateJson
  );
});
