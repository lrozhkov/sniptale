// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  content: vi.fn(() => <div data-ui="mock.inspector-content" />),
  contentProps: vi.fn(() => ({ documentOwner: true })),
}));

vi.mock('@sniptale/ui/floating-chrome', () => ({
  FloatingChromePanel: ({
    children,
    className,
    dataUi,
  }: React.PropsWithChildren<{ className?: string; dataUi: string }>) => (
    <section className={className} data-ui={dataUi}>
      {children}
    </section>
  ),
  floatingChromeClassNames: (...values: string[]) => values.join(' '),
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../chrome/tool-icons', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/tool-icons')>()),
  getToolLabel: (tool: string) => `tool:${tool}`,
}));
vi.mock('../../inspector/content', () => ({
  EditorInspectorContent: mocks.content,
}));
vi.mock('../../inspector/sidebar-expanded-content/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector/sidebar-expanded-content/helpers')>()),
  createEditorInspectorContentPanelProps: mocks.contentProps,
}));
vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  EditorIconButton: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

import { EditorFloatingLeftDrawer } from './left-drawer';
import { createFloatingDocumentControllerFixture } from './document-controller.test-support';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

it('renders the tool drawer contract and routes its close action', () => {
  const onClose = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);

  act(() =>
    root.render(
      <EditorFloatingLeftDrawer
        documentController={createFloatingDocumentControllerFixture({ inspector: 'tool' })}
        hasImage
        mode="shape-library"
        onClose={onClose}
      />
    )
  );

  expect(
    container.querySelector('[data-ui="editor.floating.left-drawer.shape-library"]')
  ).not.toBeNull();
  expect(container.textContent).toContain('tool:shape-library');
  expect(container.querySelector('[data-ui="mock.inspector-content"]')).not.toBeNull();
  expect(mocks.contentProps).toHaveBeenCalledWith(true, expect.anything());
  expect(mocks.content).toHaveBeenCalledWith(
    expect.objectContaining({
      canDeleteSelection: false,
      confirmDialog: null,
      highlightedTool: 'shape-library',
      inspector: 'tool',
      isResizableLayerSelection: false,
      richShapeSelection: null,
      selection: expect.objectContaining({ hasSelection: false }),
      showDocumentActions: false,
    }),
    undefined
  );

  act(() =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="editor.floating.left-drawer.close-button"]')
      ?.click()
  );
  expect(onClose).toHaveBeenCalledOnce();

  act(() => root.unmount());
  vi.unstubAllGlobals();
});
