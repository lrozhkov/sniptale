import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { PromptTemplate } from '../../../../../contracts/settings';
import type { TemplateListState } from './types';

const { getTemplatePillClassesMock, renderTemplateMenuMock } = vi.hoisted(() => ({
  getTemplatePillClassesMock: vi.fn(() => 'pill-classes'),
  renderTemplateMenuMock: vi.fn(() => <span>menu</span>),
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  getTemplatePillClasses: getTemplatePillClassesMock,
}));

vi.mock('./menu', () => ({
  renderTemplateMenu: renderTemplateMenuMock,
}));

vi.mock('./shell', () => ({
  TemplatePillShell: ({ children, pillClasses }: { children: ReactNode; pillClasses: string }) => (
    <div className={pillClasses}>{children}</div>
  ),
}));

import { TemplatePill } from './index';

const template: PromptTemplate = {
  content: 'Prompt',
  enabled: false,
  id: 'system-template',
  isDefault: true,
  name: 'System template',
};

beforeEach(() => {
  getTemplatePillClassesMock.mockClear();
  renderTemplateMenuMock.mockClear();
});

function createState(): TemplateListState {
  return {
    cancelDelete: vi.fn(),
    confirmDelete: vi.fn(),
    confirmState: { isOpen: false, template: null },
    draggedId: null,
    dragOverId: null,
    dragStateRef: { current: null },
    handleDeleteTemplate: vi.fn(),
    handlePointerDown: vi.fn(),
    hasMore: false,
    menuRef: { current: null },
    openMenuId: template.id,
    orderedTemplates: [template],
    pillRefs: { current: new Map<string, HTMLDivElement>() },
    setOpenMenuId: vi.fn(),
    setShowAll: vi.fn(),
    showAll: false,
    visibleTemplates: [template],
  };
}

it('marks disabled system templates and keeps their actions available', () => {
  const state = createState();

  const html = renderToStaticMarkup(
    <TemplatePill
      dragStateMoved={false}
      isLoading={false}
      onDeleteTemplate={vi.fn()}
      onEditTemplate={vi.fn()}
      onSelectTemplate={vi.fn()}
      state={state}
      template={template}
    />
  );

  expect(getTemplatePillClassesMock).toHaveBeenCalledWith(
    expect.objectContaining({ isDisabled: true, isMenuOpen: true })
  );
  expect(renderTemplateMenuMock).toHaveBeenCalledWith(expect.objectContaining({ template }));
  expect(html).toContain('pill-classes');
  expect(html).toContain('menu');
});
