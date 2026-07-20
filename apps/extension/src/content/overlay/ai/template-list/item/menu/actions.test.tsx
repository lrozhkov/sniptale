// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptTemplate } from '../../../../../../contracts/settings';

const {
  blurPromptIfFocusedMock,
  createTemplateMenuClickHandlerMock,
  dropdownDividerMock,
  dropdownItemMock,
  translateMock,
} = vi.hoisted(() => ({
  blurPromptIfFocusedMock: vi.fn(),
  createTemplateMenuClickHandlerMock: vi.fn(),
  dropdownDividerMock: vi.fn(() => <div data-testid="divider" />),
  dropdownItemMock: vi.fn(({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  )),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('@sniptale/ui/product-menus/dropdown', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-menus/dropdown')>()),
  ProductDropdownDivider: dropdownDividerMock,
  ProductDropdownItem: dropdownItemMock,
}));

vi.mock('../helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helpers')>()),
  blurPromptIfFocused: blurPromptIfFocusedMock,
  createTemplateMenuClickHandler: createTemplateMenuClickHandlerMock,
}));

import { TemplateMenuActionItems } from './actions';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const template = {
  content: 'one',
  id: 'template-1',
  name: 'One',
} as PromptTemplate;

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
  blurPromptIfFocusedMock.mockReset();
  createTemplateMenuClickHandlerMock.mockReset();
  dropdownDividerMock.mockClear();
  dropdownItemMock.mockClear();
  translateMock.mockClear();
  createTemplateMenuClickHandlerMock.mockImplementation(
    (callback: (selectedTemplate: PromptTemplate) => void, selectedTemplate: PromptTemplate) =>
      (event: React.MouseEvent) => {
        event.stopPropagation();
        callback(selectedTemplate);
      }
  );
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('TemplateMenuActionItems', () => {
  it('renders edit/delete items and stops menu mouse-down propagation', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    await renderNode(
      <TemplateMenuActionItems
        isLoading={false}
        onDelete={onDelete}
        onEdit={onEdit}
        template={template}
      />
    );

    const buttons = container?.querySelectorAll('button') ?? [];
    const mouseDown = new MouseEvent('mousedown', { bubbles: true });

    act(() => {
      buttons[0]?.dispatchEvent(mouseDown);
      buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(blurPromptIfFocusedMock).toHaveBeenCalled();
    expect(createTemplateMenuClickHandlerMock).toHaveBeenNthCalledWith(1, onEdit, template);
    expect(createTemplateMenuClickHandlerMock).toHaveBeenNthCalledWith(2, onDelete, template);
    expect(onEdit).toHaveBeenCalledWith(template);
    expect(onDelete).toHaveBeenCalledWith(template);
  });
});
