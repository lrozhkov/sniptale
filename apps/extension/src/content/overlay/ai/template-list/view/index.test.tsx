// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { bodyMock, deleteDialogMock, loadingStateMock } = vi.hoisted(() => ({
  bodyMock: vi.fn((_props: unknown) => <div data-testid="body" />),
  deleteDialogMock: vi.fn((_props: unknown) => <div data-testid="delete-dialog" />),
  loadingStateMock: vi.fn(() => <div data-testid="loading-state" />),
}));

vi.mock('./body', () => ({
  TemplateListBody: (props: unknown) => {
    bodyMock(props);
    return <div data-testid="body" />;
  },
}));

vi.mock('./dialogs', () => ({
  TemplateDeleteDialog: (props: unknown) => {
    deleteDialogMock(props);
    return <div data-testid="delete-dialog" />;
  },
}));

vi.mock('./loading', () => ({
  TemplateListLoadingState: () => {
    loadingStateMock();
    return <div data-testid="loading-state" />;
  },
}));

import { TemplateListContent } from '.';
import {
  cleanupRenderedNode,
  enableReactActEnvironment,
  renderIntoTestContainer,
  type RenderedReactTestNode,
} from '../../test-support/react-root';
import { createPromptTemplates } from '../test-support';

let rendered: RenderedReactTestNode | null = null;

const templates = createPromptTemplates().slice(0, 1);

function createState() {
  return {
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
}

function createProps() {
  return {
    isLoading: false,
    onAddTemplate: vi.fn(),
    onDeleteTemplate: vi.fn(),
    onEditTemplate: vi.fn(),
    onSelectTemplate: vi.fn(),
    state: createState(),
    templates,
  };
}

async function renderNode(node: React.ReactNode) {
  rendered = await renderIntoTestContainer(node);
}

enableReactActEnvironment();

beforeEach(() => {
  bodyMock.mockClear();
  deleteDialogMock.mockClear();
  loadingStateMock.mockClear();
});

afterEach(() => {
  cleanupRenderedNode(rendered);
  rendered = null;
});

describe('TemplateListContent', () => {
  it('renders only the loading owner while templates are loading', async () => {
    const props = createProps();
    props.isLoading = true;

    await renderNode(<TemplateListContent {...props} />);

    expect(loadingStateMock).toHaveBeenCalledOnce();
    expect(bodyMock).not.toHaveBeenCalled();
    expect(deleteDialogMock).not.toHaveBeenCalled();
  });

  it('passes body and delete-dialog contracts to canonical owners', async () => {
    const props = createProps();

    await renderNode(<TemplateListContent {...props} />);

    expect(bodyMock).toHaveBeenCalledWith({
      isLoading: false,
      onAddTemplate: props.onAddTemplate,
      onEditTemplate: props.onEditTemplate,
      onSelectTemplate: props.onSelectTemplate,
      state: props.state,
      templates: props.templates,
    });
    expect(deleteDialogMock).toHaveBeenCalledWith({
      isLoading: false,
      onDeleteTemplate: props.onDeleteTemplate,
      state: props.state,
    });
  });
});
