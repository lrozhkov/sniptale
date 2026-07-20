// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptTemplate } from '../../../../../../contracts/settings';
import type { TemplateListState } from '../types';

const {
  createTemplateMenuToggleHandlerMock,
  menuClickHandlerMock,
  shellMock,
  stopTemplateMenuEventMock,
  templatePillButtonMock,
  translateMock,
  updateTemplatePillRefsMock,
} = vi.hoisted(() => ({
  createTemplateMenuToggleHandlerMock: vi.fn(),
  menuClickHandlerMock: vi.fn(),
  shellMock: vi.fn(),
  stopTemplateMenuEventMock: vi.fn(),
  templatePillButtonMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
  updateTemplatePillRefsMock: vi.fn(),
}));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('@sniptale/ui/product-menus/dropdown', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-menus/dropdown')>()),
  ProductTemplateMenuShell: React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'> & {
      label: React.ReactNode;
      menuDisabled: boolean;
      menuLabel: string;
      onMenuClick: (event: React.MouseEvent) => void;
      onMenuMouseDown: (event: React.MouseEvent) => void;
      open: boolean;
    }
  >((props, ref) => {
    shellMock(props);
    return (
      <div ref={ref} className={props.className}>
        <div
          data-testid="menu-shell"
          data-menu-disabled={String(props.menuDisabled)}
          data-menu-label={String(props.menuLabel)}
          data-open={String(props.open)}
          onClick={props.onMenuClick}
          onMouseDown={props.onMenuMouseDown}
        />
        <div data-testid="pointer-shell" onMouseDown={props.onMouseDown} />
        <div data-testid="label">{props.label as React.ReactNode}</div>
        {props.children}
      </div>
    );
  }),
}));

vi.mock('./button', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./button')>()),
  TemplatePillButton: (props: unknown) => {
    templatePillButtonMock(props);
    return <button data-testid="template-pill-button" type="button" />;
  },
}));

vi.mock('./wiring', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./wiring')>()),
  createTemplateMenuToggleHandler: createTemplateMenuToggleHandlerMock,
  stopTemplateMenuEvent: stopTemplateMenuEventMock,
  updateTemplatePillRefs: updateTemplatePillRefsMock,
}));

import { TemplatePillShell } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const template = {
  content: 'one',
  id: 'template-1',
  name: 'One',
} as PromptTemplate;

function createState(): TemplateListState & { handlePointerDown: ReturnType<typeof vi.fn> } {
  const handlePointerDown = vi.fn();

  return {
    cancelDelete: vi.fn(),
    confirmDelete: vi.fn(),
    confirmState: { isOpen: false, template: null },
    draggedId: null,
    dragOverId: null,
    dragStateRef: { current: null },
    handleDeleteTemplate: vi.fn(),
    handlePointerDown,
    hasMore: false,
    menuRef: { current: null },
    openMenuId: null,
    orderedTemplates: [],
    pillRefs: { current: new Map<string, HTMLDivElement>() },
    setOpenMenuId: vi.fn(),
    setShowAll: vi.fn(),
    showAll: false,
    visibleTemplates: [],
  };
}

async function renderShell(
  state: ReturnType<typeof createState>,
  onSelectTemplate: (template: PromptTemplate) => void
) {
  await renderNode(
    <TemplatePillShell
      dragStateMoved={false}
      isLoading={false}
      isMenuOpen={true}
      onDeleteTemplate={vi.fn()}
      onEditTemplate={vi.fn()}
      onSelectTemplate={onSelectTemplate}
      pillClasses="pill-classes"
      state={state}
      template={template}
    >
      <div data-testid="menu-content" />
    </TemplatePillShell>
  );
}

function getRenderedShellParts() {
  const shellElement = container?.firstElementChild as HTMLDivElement | null;
  const menuShell = container?.querySelector('[data-testid="menu-shell"]');
  const pointerShell = container?.querySelector('[data-testid="pointer-shell"]');

  if (!shellElement || !menuShell || !pointerShell) {
    throw new Error('Expected rendered shell wrappers');
  }

  return { menuShell, pointerShell, shellElement };
}

function triggerShellEvents(menuShell: Element, pointerShell: Element) {
  act(() => {
    menuShell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    menuShell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    pointerShell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
}

function expectShellContracts(props: {
  onSelectTemplate: (template: PromptTemplate) => void;
  shellElement: HTMLDivElement;
  state: ReturnType<typeof createState>;
}) {
  expect(templatePillButtonMock).toHaveBeenCalledWith({
    dragStateMoved: false,
    isLoading: false,
    onSelectTemplate: props.onSelectTemplate,
    template,
  });
  expect(createTemplateMenuToggleHandlerMock).toHaveBeenCalledWith({
    isMenuOpen: true,
    setOpenMenuId: props.state.setOpenMenuId,
    templateId: template.id,
  });
  expect(menuClickHandlerMock).toHaveBeenCalledTimes(1);
  expect(stopTemplateMenuEventMock).toHaveBeenCalledTimes(1);
  expect(props.state.handlePointerDown).toHaveBeenCalledTimes(1);
  expect(props.state.handlePointerDown.mock.calls[0]?.[1]).toBe(template.id);
  expect(updateTemplatePillRefsMock).toHaveBeenCalledWith({
    element: props.shellElement,
    isMenuOpen: true,
    state: props.state,
    templateId: template.id,
  });
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
  createTemplateMenuToggleHandlerMock.mockReset();
  menuClickHandlerMock.mockReset();
  shellMock.mockReset();
  stopTemplateMenuEventMock.mockReset();
  templatePillButtonMock.mockReset();
  translateMock.mockClear();
  updateTemplatePillRefsMock.mockReset();
  createTemplateMenuToggleHandlerMock.mockImplementation(() => menuClickHandlerMock);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('TemplatePillShell', () => {
  it('wires shell props and delegates button, menu, and pointer contracts', async () => {
    const state = createState();
    const onSelectTemplate = vi.fn();

    await renderShell(state, onSelectTemplate);

    const { menuShell, pointerShell, shellElement } = getRenderedShellParts();

    triggerShellEvents(menuShell, pointerShell);
    expectShellContracts({ onSelectTemplate, shellElement, state });
  });
});
