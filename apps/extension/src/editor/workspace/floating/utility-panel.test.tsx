// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorFloatingUtilityPanel } from './utility-panel';

const mocks = vi.hoisted(() => ({
  cancelCropMode: vi.fn(),
  content: vi.fn(() => <div data-ui="mock.content" />),
  contentProps: vi.fn(() => ({ content: true })),
  setActiveTool: vi.fn(),
  setInspector: vi.fn(),
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useOptionalEditorController: () => ({ cancelCropMode: mocks.cancelCropMode }),
}));
vi.mock('../../inspector/content', () => ({ EditorInspectorContent: mocks.content }));
vi.mock('../../inspector/sidebar-expanded-content/helpers', () => ({
  createEditorInspectorContentPanelProps: mocks.contentProps,
  createEditorInspectorLayersPanelProps: vi.fn(),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  const anchor = document.createElement('button');
  anchor.dataset['ui'] = 'editor.toolbar.inspector.frame';
  anchor.getBoundingClientRect = () => ({ height: 32, top: 200 }) as DOMRect;
  document.body.appendChild(anchor);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('sizes compact utility panels by content and anchors them next to the tool icon', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <EditorFloatingUtilityPanel
        documentController={
          {
            setActiveTool: mocks.setActiveTool,
            setInspector: mocks.setInspector,
          } as never
        }
        hasImage
        inspectorMeta={{ subtitle: 'Scene', title: 'Frame' }}
        mode="frame"
      />
    );
  });

  const panel = container.querySelector<HTMLElement>(
    '[data-ui="editor.floating.utility-panel.frame"]'
  );
  const title = panel?.querySelector<HTMLElement>('.uppercase');
  expect(panel?.style.top).toBe('216px');
  expect(panel?.textContent).toContain('Frame');
  expect(panel?.textContent).not.toContain('Scene');
  expect(title?.className).toContain('text-[12px]');
  expect(title?.className).toContain('font-bold');
  expect(mocks.content).toHaveBeenCalledWith(
    expect.objectContaining({ inspector: 'frame', showDocumentActions: false }),
    undefined
  );

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="editor.floating.utility-panel.close-button"]')
      ?.click();
  });
  expect(mocks.setInspector).toHaveBeenCalledWith('tool');
  expect(mocks.cancelCropMode).not.toHaveBeenCalled();
  expect(mocks.setActiveTool).not.toHaveBeenCalled();
});

it('cancels resize crop state before closing canvas-size utility panels', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <EditorFloatingUtilityPanel
        documentController={
          {
            setActiveTool: mocks.setActiveTool,
            setInspector: mocks.setInspector,
          } as never
        }
        hasImage
        inspectorMeta={{ subtitle: 'Resize', title: 'Canvas size' }}
        mode="canvas-size"
      />
    );
  });

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="editor.floating.utility-panel.close-button"]')
      ?.click();
  });

  expect(mocks.cancelCropMode).toHaveBeenCalledTimes(1);
  expect(mocks.setActiveTool).toHaveBeenCalledWith('select');
  expect(mocks.setInspector).toHaveBeenCalledWith('tool');
});
