// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { EditorFloatingDocumentController } from './document-bar';
import { EditorFloatingLeftDrawer } from './left-drawer';

const mocks = vi.hoisted(() => ({
  mode: null as 'scenario' | null,
  content: vi.fn((_props: unknown) => <div>Shape options</div>),
}));
vi.mock('../../application/embed-context/context', () => ({
  useEditorEmbedContext: () => ({ mode: mocks.mode }),
}));
vi.mock('../../inspector/sidebar-expanded-content/helpers', () => ({
  createEditorInspectorContentPanelProps: () => ({}),
}));
vi.mock('../../inspector/content', () => ({ EditorInspectorContent: mocks.content }));

it.each([null, 'scenario'] as const)('keeps the %s shape drawer scoped and dismissible', (mode) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.mode = mode;
  mocks.content.mockClear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  // The mocked inspector adapter does not read controller fields in this surface test.
  const controller = {} as EditorFloatingDocumentController;
  try {
    act(() =>
      root.render(
        <EditorFloatingLeftDrawer
          documentController={controller}
          hasImage
          mode="shape"
          onClose={close}
        />
      )
    );
    expect(host.textContent).toContain('Shape options');
    expect(mocks.content.mock.calls[0]?.[0]).toMatchObject({
      inspector: 'tool',
      highlightedTool: 'shape',
      showDocumentActions: false,
      selection: { hasSelection: false },
    });
    const panel = host.querySelector('[data-ui="editor.floating.left-drawer.shape"]');
    expect(panel?.className.includes('min-[721px]:max-[1439px]:!top-[8.5rem]')).toBe(
      mode === 'scenario'
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[data-ui="editor.floating.left-drawer.close-button"]')
        ?.click()
    );
    expect(close).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
