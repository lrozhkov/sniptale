// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasWrapperSurface } from './surface';

vi.mock('./context-menu', () => ({
  CanvasContextMenu: () => <div data-ui="mock.context-menu" />,
}));
vi.mock('./views', () => ({
  CanvasEmptyState: () => <div data-ui="mock.empty-state" />,
  CanvasViewport: () => <div data-ui="mock.viewport" />,
}));

function createProps(overrides: Partial<Parameters<typeof CanvasWrapperSurface>[0]> = {}) {
  return {
    backgroundColor: '#fff',
    canvasRef: { current: null },
    contextMenuState: null,
    controller: {} as never,
    gridOverlayClassName: 'grid-overlay',
    gridStyle: null,
    handleCanvasContextMenu: vi.fn(),
    hasImage: true,
    imageIntake: {
      dragActive: false,
      onDragLeave: vi.fn(),
      onDragOver: vi.fn(),
      onDrop: vi.fn(),
      onOpenImage: vi.fn(),
    },
    layers: [],
    openImageFile: vi.fn(),
    openImageInputRef: { current: null },
    surfaceRef: { current: null },
    stageRef: { current: null },
    viewportRef: { current: null },
    wrapperRef: { current: null },
    onCloseContextMenu: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof CanvasWrapperSurface>[0];
}

it('renders canvas surface chrome, viewport, empty state, and context menu branches', () => {
  const loadedMarkup = renderToStaticMarkup(<CanvasWrapperSurface {...createProps()} />);
  expect(loadedMarkup).toContain('editor.canvas.wrapper');
  expect(loadedMarkup).toContain('editor.canvas.context-zone');
  expect(loadedMarkup).toContain('grid-overlay');
  expect(loadedMarkup).toContain('mock.viewport');
  expect(loadedMarkup).not.toContain('mock.empty-state');

  const emptyMarkup = renderToStaticMarkup(
    <CanvasWrapperSurface
      {...createProps({ contextMenuState: { x: 1, y: 2 } as never, hasImage: false })}
    />
  );
  expect(emptyMarkup).toContain('mock.empty-state');
  expect(emptyMarkup).toContain('mock.context-menu');
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('routes drag events and hidden file input changes through canvas intake props', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const props = createProps();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => root?.render(<CanvasWrapperSurface {...props} />));

  const wrapper = container.querySelector<HTMLElement>('[data-ui="editor.canvas.wrapper"]');
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  const file = new File(['image'], 'image.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });

  act(() => {
    wrapper?.dispatchEvent(new Event('dragover', { bubbles: true }));
    wrapper?.dispatchEvent(new Event('dragleave', { bubbles: true }));
    wrapper?.dispatchEvent(new Event('drop', { bubbles: true }));
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(props.imageIntake.onDragOver).toHaveBeenCalledOnce();
  expect(props.imageIntake.onDragLeave).toHaveBeenCalledOnce();
  expect(props.imageIntake.onDrop).toHaveBeenCalledOnce();
  expect(props.openImageFile).toHaveBeenCalledWith(file);
  vi.unstubAllGlobals();
});
