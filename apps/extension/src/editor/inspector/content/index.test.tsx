// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

const contentIndexMocks = vi.hoisted(() => ({
  bodyRenderer: vi.fn((_bodyProps: unknown, _controller: unknown) => (
    <div data-testid="body-renderer">body</div>
  )),
  contentBodyPropsFactory: vi.fn((_props: unknown) => ({ derived: 'body-props' })),
  contentSection: vi.fn((_props: unknown) => (
    <div data-testid="document-actions-section">actions</div>
  )),
  controller: { id: 'controller' },
  locale: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
  useAppLocale: contentIndexMocks.locale,
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: {
    cancelText: string;
    confirmText: string;
    message: string;
    title: string;
  }) => <div data-testid="confirm-dialog">{props.title}</div>,
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal()),
  useEditorController: () => contentIndexMocks.controller,
}));

vi.mock('../content-sections', async (importOriginal) => ({
  ...(await importOriginal()),
  EditorInspectorDocumentActionsSection: (props: unknown) => {
    contentIndexMocks.contentSection(props);
    return <div data-testid="document-actions-section">actions</div>;
  },
  renderEditorInspectorContentBody: (contentBodyProps: unknown, controller: unknown) =>
    contentIndexMocks.bodyRenderer(contentBodyProps, controller),
}));

vi.mock('./params', () => ({
  createEditorInspectorContentBodyProps: (props: unknown) =>
    contentIndexMocks.contentBodyPropsFactory(props),
}));

import { EditorInspectorContent } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function createProps(
  overrides: Partial<ComponentProps<typeof EditorInspectorContent>> = {}
): ComponentProps<typeof EditorInspectorContent> {
  return {
    ...(createContentProps() as ComponentProps<typeof EditorInspectorContent>),
    ...overrides,
  };
}

function registerDocumentActionsBranchTest() {
  it('renders the document-actions branch with confirm dialog content', () => {
    const props = createProps({
      confirmDialog: {
        cancelText: 'Cancel',
        confirmText: 'Confirm',
        message: 'Close the current document?',
        title: 'Confirm close',
      },
      hasImage: false,
      showDocumentActions: true,
    });

    render(<EditorInspectorContent {...props} />);

    expect(contentIndexMocks.locale).toHaveBeenCalledOnce();
    expect(contentIndexMocks.contentSection).toHaveBeenCalledWith(expect.objectContaining(props));
    expect(contentIndexMocks.bodyRenderer).not.toHaveBeenCalled();
    expect(container?.querySelector('[data-testid="confirm-dialog"]')?.textContent).toContain(
      'Confirm close'
    );
  });
}

function registerContentBodyBranchTest() {
  it('renders content body only when the editor has an image', () => {
    const props = createProps({ hasImage: true, showDocumentActions: false });

    render(<EditorInspectorContent {...props} />);

    expect(contentIndexMocks.contentBodyPropsFactory).toHaveBeenCalledWith(props);
    expect(contentIndexMocks.bodyRenderer).toHaveBeenCalledWith(
      { derived: 'body-props' },
      contentIndexMocks.controller
    );
    expect(contentIndexMocks.contentSection).not.toHaveBeenCalled();
    expect(container?.innerHTML).toContain('space-y-5');
  });
}

describe('inspector/content index', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    contentIndexMocks.bodyRenderer.mockClear();
    contentIndexMocks.contentBodyPropsFactory.mockClear();
    contentIndexMocks.contentSection.mockClear();
    contentIndexMocks.locale.mockClear();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
  });

  registerDocumentActionsBranchTest();
  registerContentBodyBranchTest();
});
