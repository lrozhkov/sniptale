// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';

import { FieldRow } from './field-row';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const field = {
  id: 'field-1',
  label: 'Status',
  selected: true,
  type: 'field',
  value: 'Open',
  valueType: 'string',
} as FieldNode;

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

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('FieldRow', () => {
  it('renders selected field content and delegates checkbox toggles', async () => {
    const toggleSelected = vi.fn();

    await renderNode(
      <FieldRow
        field={field}
        state={{ expanded: true, id: 'field-1', selected: true }}
        toggleSelected={toggleSelected}
      />
    );

    const row = container?.querySelector('.sniptale-tree-row');
    const checkbox = container?.querySelector('input');

    act(() => {
      checkbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(row?.className).toContain('sniptale-tree-row-field-selected');
    expect(container?.textContent).toContain('Status: Open');
    expect(toggleSelected).toHaveBeenCalledWith('field-1');
  });
});
