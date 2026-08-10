// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { templatesSectionContentSpy, useTemplatesSectionSpy } = vi.hoisted(() => ({
  templatesSectionContentSpy: vi.fn(),
  useTemplatesSectionSpy: vi.fn(),
}));

vi.mock('./content', () => ({
  TemplatesSectionContent: (props: unknown) => {
    templatesSectionContentSpy(props);
    return <div data-testid="templates-section-content" />;
  },
}));

vi.mock('./controller', () => ({
  useTemplatesSection: () => useTemplatesSectionSpy(),
}));

import { TemplatesSection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSection() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<TemplatesSection />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  templatesSectionContentSpy.mockReset();
  useTemplatesSectionSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('forwards template section state into the templates content shell', async () => {
  const sectionState = {
    closeDeleteDialog: vi.fn(),
    closeTemplateEditor: vi.fn(),
    confirmDelete: vi.fn(async () => undefined),
    confirmState: { isOpen: false, template: null },
    editingTemplate: undefined,
    handleEditTemplate: vi.fn(),
    handleSaveTemplate: vi.fn(async () => undefined),
    templateLifecycle: {
      move: vi.fn(async () => undefined),
      requestDelete: vi.fn(),
      restore: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => undefined),
    },
    isEditorOpen: false,
    status: { isLoading: false, isMutating: false, submitError: null },
    openNewTemplateEditor: vi.fn(),
    templates: [],
  };

  useTemplatesSectionSpy.mockReturnValue(sectionState);

  await renderSection();

  expect(templatesSectionContentSpy).toHaveBeenCalledWith(sectionState);
  expect(container?.querySelector('[data-testid="templates-section-content"]')).not.toBeNull();
});

it('forwards the editing template only when the controller exposes one', async () => {
  useTemplatesSectionSpy.mockReturnValue({
    closeDeleteDialog: vi.fn(),
    closeTemplateEditor: vi.fn(),
    confirmDelete: vi.fn(async () => undefined),
    confirmState: { isOpen: false, template: null },
    editingTemplate: { id: 'template-1', title: 'Prompt', content: 'Body' },
    handleEditTemplate: vi.fn(),
    handleSaveTemplate: vi.fn(async () => undefined),
    templateLifecycle: {
      move: vi.fn(async () => undefined),
      requestDelete: vi.fn(),
      restore: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => undefined),
    },
    isEditorOpen: true,
    status: { isLoading: false, isMutating: false, submitError: null },
    openNewTemplateEditor: vi.fn(),
    templates: [],
  });

  await renderSection();

  expect(templatesSectionContentSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      editingTemplate: expect.objectContaining({ id: 'template-1' }),
      isEditorOpen: true,
    })
  );
});
