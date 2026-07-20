// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { actionsMock, pillMock, translateMock } = vi.hoisted(() => ({
  actionsMock: vi.fn((_props: unknown) => <div data-testid="actions" />),
  pillMock: vi.fn((_props: unknown) => <div data-testid="pill" />),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: translateMock,
}));

vi.mock('./actions', () => ({
  TemplateListActions: (props: unknown) => {
    actionsMock(props);
    return <div data-testid="actions" />;
  },
}));

vi.mock('../item', () => ({
  TemplatePill: (props: unknown) => {
    pillMock(props);
    return <div data-testid="pill" />;
  },
}));

import { TemplateListBody } from './body';
import {
  cleanupRenderedNode,
  enableReactActEnvironment,
  renderIntoTestContainer,
  type RenderedReactTestNode,
} from '../../test-support/react-root';
import { createPromptTemplates } from '../test-support';

let rendered: RenderedReactTestNode | null = null;

const templates = createPromptTemplates();

function createState() {
  return {
    cancelDelete: vi.fn(),
    confirmDelete: vi.fn(),
    confirmState: { isOpen: false, template: null },
    dragStateRef: { current: { id: 'template-1', moved: true, startX: 0, startY: 0 } },
    draggedId: 'template-1',
    dragOverId: null,
    handleDeleteTemplate: vi.fn(),
    handlePointerDown: vi.fn(),
    hasMore: true,
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
  actionsMock.mockClear();
  pillMock.mockClear();
  translateMock.mockClear();
});

afterEach(() => {
  cleanupRenderedNode(rendered);
  rendered = null;
});

describe('TemplateListBody', () => {
  it('renders the dragged visible template list and delegates action props to owner-local views', async () => {
    const props = createProps();

    await renderNode(<TemplateListBody {...props} />);

    expect(rendered?.container.querySelector('.sniptale-label')?.textContent).toBe(
      'aiModal.templatesLabel'
    );
    expect(rendered?.container.querySelector('.sniptale-template-container.dragging')).toBeTruthy();
    expect(pillMock).toHaveBeenCalledTimes(2);
    expect(pillMock).toHaveBeenNthCalledWith(1, {
      dragStateMoved: true,
      isLoading: false,
      onDeleteTemplate: props.state.handleDeleteTemplate,
      onEditTemplate: props.onEditTemplate,
      onSelectTemplate: props.onSelectTemplate,
      state: props.state,
      template: templates[0],
    });
    expect(actionsMock).toHaveBeenCalledWith({
      hasMore: true,
      isLoading: false,
      onAddTemplate: props.onAddTemplate,
      orderedTemplatesCount: 2,
      setShowAll: props.state.setShowAll,
      showAll: false,
    });
  });
});

describe('TemplateListBody empty state', () => {
  it('shows the empty-state copy when no templates are available', async () => {
    const props = createProps();
    props.state.visibleTemplates = [];
    props.state.orderedTemplates = [];
    props.state.hasMore = false;
    props.templates = [];

    await renderNode(<TemplateListBody {...props} />);

    expect(rendered?.container.querySelector('.sniptale-template-empty')?.textContent).toBe(
      'aiModal.templatesEmpty'
    );
    expect(pillMock).not.toHaveBeenCalled();
    expect(actionsMock).toHaveBeenCalledWith({
      hasMore: false,
      isLoading: false,
      onAddTemplate: props.onAddTemplate,
      orderedTemplatesCount: 0,
      setShowAll: props.state.setShowAll,
      showAll: false,
    });
  });
});
