// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptTemplate } from '../../../../contracts/settings';

const { contentMock, useTemplateListStateMock } = vi.hoisted(() => ({
  contentMock: vi.fn((_props: unknown) => <div data-testid="template-list-content" />),
  useTemplateListStateMock: vi.fn(),
}));

vi.mock('./state', () => ({
  useTemplateListState: useTemplateListStateMock,
}));

vi.mock('./view', () => ({
  TemplateListContent: (props: unknown) => {
    contentMock(props);
    return <div data-testid="template-list-content" />;
  },
}));

import { TemplateList } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const templates = [{ content: 'one', id: 'template-1', name: 'One' }] as PromptTemplate[];

function createProps() {
  return {
    isLoading: false,
    onAddTemplate: vi.fn(),
    onDeleteTemplate: vi.fn(),
    onEditTemplate: vi.fn(),
    onSelectTemplate: vi.fn(),
    templates,
  };
}

const state = {
  cancelDelete: vi.fn(),
  confirmDelete: vi.fn(),
  confirmState: { isOpen: false, template: null },
  draggedId: null,
  dragStateRef: { current: { id: 'template-1', moved: false, startX: 0, startY: 0 } },
  dragOverId: null,
  handleDeleteTemplate: vi.fn(),
  handlePointerDown: vi.fn(),
  hasMore: false,
  menuRef: { current: null },
  openMenuId: null,
  orderedTemplates: templates,
  pillRefs: { current: new Map<string, HTMLDivElement>() },
  setOpenMenuId: vi.fn(),
  setShowAll: vi.fn(),
  showAll: false,
  visibleTemplates: templates,
};

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
  contentMock.mockClear();
  useTemplateListStateMock.mockReset();
  useTemplateListStateMock.mockReturnValue(state);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('TemplateList', () => {
  it('delegates list props into the state hook and content shell', async () => {
    const props = createProps();

    await renderNode(<TemplateList {...props} />);

    expect(useTemplateListStateMock).toHaveBeenCalledWith(props);
    expect(contentMock).toHaveBeenCalledWith({
      ...props,
      state,
    });
  });
});
