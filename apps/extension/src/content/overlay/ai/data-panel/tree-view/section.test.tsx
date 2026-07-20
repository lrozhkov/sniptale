// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TreeRenderProps } from '../tree/types';

const { childrenMock, getDefaultTreeNodeStateMock, translateMock } = vi.hoisted(() => ({
  childrenMock: vi.fn((_props: unknown) => <div data-testid="children" />),
  getDefaultTreeNodeStateMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),

  translate: translateMock,
}));

vi.mock('../tree/helpers', () => ({
  getDefaultTreeNodeState: getDefaultTreeNodeStateMock,
}));

vi.mock('./section-children', () => ({
  TreeSectionChildren: (props: unknown) => {
    childrenMock(props);
    return <div data-testid="children" />;
  },
}));

import { TreeSection } from './section';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const section = {
  children: [],
  id: 'section-1',
  selected: true,
  title: 'Section',
  type: 'section',
} as unknown as SectionNode;

function createTreeRenderProps(): TreeRenderProps {
  return {
    excludedColumns: new Map(),
    toggleColumnExclusion: vi.fn(),
    toggleExpanded: vi.fn(),
    toggleSelected: vi.fn(),
    treeState: new Map(),
  };
}

async function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(node);
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  childrenMock.mockClear();
  getDefaultTreeNodeStateMock.mockReset();
  translateMock.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('TreeSection', () => {
  it('renders expanded section state and delegates select/expand interactions', async () => {
    const treeRenderProps = createTreeRenderProps();
    getDefaultTreeNodeStateMock.mockReturnValue({
      expanded: true,
      id: 'section-1',
      selected: true,
    });

    await renderNode(<TreeSection section={section} treeRenderProps={treeRenderProps} />);

    const checkbox = container?.querySelector('input');
    const button = container?.querySelector('button');
    const title = container?.querySelector('.sniptale-ai-section-title');

    act(() => {
      checkbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      title?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getDefaultTreeNodeStateMock).toHaveBeenCalledWith('section-1', true, treeRenderProps);
    expect(container?.querySelector('.sniptale-tree-row')?.className).toContain(
      'sniptale-tree-row-selected'
    );
    expect(button?.getAttribute('title')).toBe('aiModal.collapseTitle');
    expect(treeRenderProps.toggleSelected).toHaveBeenCalledWith('section-1');
    expect(treeRenderProps.toggleExpanded).toHaveBeenNthCalledWith(1, 'section-1');
    expect(treeRenderProps.toggleExpanded).toHaveBeenNthCalledWith(2, 'section-1');
    expect(childrenMock).toHaveBeenCalledWith({ section, treeRenderProps });
  });

  it('skips child rendering when the section is collapsed', async () => {
    getDefaultTreeNodeStateMock.mockReturnValue({
      expanded: false,
      id: 'section-1',
      selected: true,
    });

    await renderNode(<TreeSection section={section} treeRenderProps={createTreeRenderProps()} />);

    expect(childrenMock).not.toHaveBeenCalled();
  });
});
