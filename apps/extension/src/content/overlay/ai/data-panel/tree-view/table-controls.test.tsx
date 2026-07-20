// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableNode } from '@sniptale/runtime-contracts/dom-tree';

const { translateMock } = vi.hoisted(() => ({
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),

  translate: translateMock,
}));

import { TableSectionControls } from './table-controls';
import {
  cleanupRenderedNode,
  enableReactActEnvironment,
  renderIntoTestContainer,
  type RenderedReactTestNode,
} from '../../test-support/react-root';

let rendered: RenderedReactTestNode | null = null;

const table = {
  headers: ['Name', 'Role'],
  id: 'table-1',
  rows: [],
  selected: true,
  type: 'table',
} as unknown as TableNode;

async function renderNode(node: React.ReactNode) {
  rendered = await renderIntoTestContainer(node);
}

enableReactActEnvironment();

beforeEach(() => {
  translateMock.mockClear();
});

afterEach(() => {
  cleanupRenderedNode(rendered);
  rendered = null;
});

describe('TableSectionControls', () => {
  it('renders headers, marks excluded columns, and delegates expand/column toggles', async () => {
    const toggleColumnExclusion = vi.fn();
    const toggleExpanded = vi.fn();

    await renderNode(
      <TableSectionControls
        expanded={false}
        table={table}
        tableExcludedColumns={['Role']}
        toggleColumnExclusion={toggleColumnExclusion}
        toggleExpanded={toggleExpanded}
      />
    );

    const [expandButton, nameCheckbox, roleCheckbox] =
      rendered?.container.querySelectorAll<HTMLInputElement | HTMLButtonElement>('button, input') ??
      [];
    const labels = rendered?.container.querySelectorAll<HTMLLabelElement>('label') ?? [];

    act(() => {
      expandButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      nameCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      roleCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(expandButton?.getAttribute('title')).toBe('aiModal.expandRowsTitle');
    expect(labels[1]?.className).toContain('excluded');
    expect(toggleExpanded).toHaveBeenCalledWith('table-1');
    expect(toggleColumnExclusion).toHaveBeenNthCalledWith(1, 'table-1', 'Name');
    expect(toggleColumnExclusion).toHaveBeenNthCalledWith(2, 'table-1', 'Role');
  });
});
