// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { translateMock } = vi.hoisted(() => ({
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', () => ({
  translate: translateMock,
}));

import { DataSelectionPreviewActions } from './actions';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

describe('DataSelectionPreviewActions', () => {
  it('renders bulk action buttons and stops header click propagation', async () => {
    const parentClick = vi.fn();
    const toggleExpandAll = vi.fn();
    const toggleSelectAll = vi.fn();

    await renderNode(
      <div onClick={parentClick}>
        <DataSelectionPreviewActions
          isAnyExpanded={true}
          isAnySelected={false}
          isLoading={false}
          toggleExpandAll={toggleExpandAll}
          toggleSelectAll={toggleSelectAll}
        />
      </div>
    );

    const buttons = container?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    const actionHost = container?.querySelector('.sniptale-ai-spoiler-actions');

    act(() => {
      actionHost?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(parentClick).not.toHaveBeenCalled();
    expect(buttons[0]?.getAttribute('title')).toBe('aiModal.collapseAllGroupsTitle');
    expect(buttons[1]?.getAttribute('title')).toBe('aiModal.selectAllTitle');
    expect(toggleExpandAll).toHaveBeenCalled();
    expect(toggleSelectAll).toHaveBeenCalled();
  });
});
