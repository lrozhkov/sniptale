// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { actionsMock, translateMock } = vi.hoisted(() => ({
  actionsMock: vi.fn((_props: unknown) => <div data-testid="bulk-actions" />),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: translateMock,
}));

vi.mock('./actions', () => ({
  DataSelectionPreviewActions: (props: unknown) => {
    actionsMock(props);
    return <div data-testid="bulk-actions" />;
  },
}));

import { DataSelectionPreviewHeader } from './header';

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
  actionsMock.mockClear();
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

describe('DataSelectionPreviewHeader', () => {
  it('renders spoiler summary and delegates the bulk-action contract when open', async () => {
    const handleToggleSpoiler = vi.fn();
    const toggleExpandAll = vi.fn();
    const toggleSelectAll = vi.fn();

    await renderNode(
      <DataSelectionPreviewHeader
        getSummaryToneClass={() => 'tone-ok'}
        handleToggleSpoiler={handleToggleSpoiler}
        isAnyExpanded={true}
        isAnySelected={false}
        isDataSpoilerOpen={true}
        isLoading={false}
        spoilerSummary="2 groups"
        toggleExpandAll={toggleExpandAll}
        toggleSelectAll={toggleSelectAll}
      />
    );

    const header = container?.querySelector('.sniptale-spoiler-header');

    act(() => {
      header?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container?.querySelector('.sniptale-ai-spoiler-summary')?.className).toContain(
      'tone-ok'
    );
    expect(container?.textContent).toContain('2 groups');
    expect(actionsMock).toHaveBeenCalledWith({
      isAnyExpanded: true,
      isAnySelected: false,
      isLoading: false,
      toggleExpandAll,
      toggleSelectAll,
    });
    expect(handleToggleSpoiler).toHaveBeenCalledTimes(1);
    expect(header?.getAttribute('role')).toBe('button');
    expect(header?.getAttribute('tabindex')).toBe('0');
  });
});

describe('DataSelectionPreviewHeader keyboard support', () => {
  it('supports keyboard toggle semantics for the activatable header', async () => {
    const handleToggleSpoiler = vi.fn();

    await renderNode(
      <DataSelectionPreviewHeader
        getSummaryToneClass={() => 'tone-ok'}
        handleToggleSpoiler={handleToggleSpoiler}
        isAnyExpanded={false}
        isAnySelected={false}
        isDataSpoilerOpen={false}
        isLoading={false}
        spoilerSummary="idle"
        toggleExpandAll={vi.fn()}
        toggleSelectAll={vi.fn()}
      />
    );

    act(() => {
      container
        ?.querySelector('.sniptale-spoiler-header')
        ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(handleToggleSpoiler).toHaveBeenCalledTimes(1);
  });
});

describe('DataSelectionPreviewHeader closed state', () => {
  it('omits bulk actions when the spoiler is closed', async () => {
    await renderNode(
      <DataSelectionPreviewHeader
        getSummaryToneClass={() => 'tone-idle'}
        handleToggleSpoiler={vi.fn()}
        isAnyExpanded={false}
        isAnySelected={false}
        isDataSpoilerOpen={false}
        isLoading={false}
        spoilerSummary="idle"
        toggleExpandAll={vi.fn()}
        toggleSelectAll={vi.fn()}
      />
    );

    expect(actionsMock).not.toHaveBeenCalled();
  });
});
