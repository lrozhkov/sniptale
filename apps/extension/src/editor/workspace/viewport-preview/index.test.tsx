// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { EditorViewportPreview } from './';

const mocks = vi.hoisted(() => ({
  controller: {
    canvas: { getElement: vi.fn(() => null) },
    navigateViewportTo: vi.fn(),
  },
  keyHandler: vi.fn(),
  pointerHandlers: {
    handlePointerDown: vi.fn(),
    handlePointerMove: vi.fn(),
    handlePointerRelease: vi.fn(),
  },
  preview: vi.fn(() => ({
    dragPointerIdRef: { current: null },
    navigateFromClientPoint: vi.fn(),
    previewCanvasRef: { current: null },
    previewSize: { height: 64, width: 96 },
    previewSurfaceRef: { current: null },
    viewportCenter: { x: 0.5, y: 0.5 },
    viewportFrame: { height: 20, left: 5, top: 4, width: 30 },
  })),
  storeState: {
    viewport: {
      canvasHeight: 100,
      canvasWidth: 200,
    },
    viewportPreviewOpen: true,
  },
}));

vi.mock('../../application/controller-context', () => ({
  EditorControllerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useEditorController: () => mocks.controller,
  useOptionalEditorController: () => null,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: (selector: (state: typeof mocks.storeState) => unknown) =>
    selector(mocks.storeState),
}));
vi.mock('./events', () => ({
  createEditorViewportPreviewKeyHandler: () => mocks.keyHandler,
  createEditorViewportPreviewPointerHandlers: () => mocks.pointerHandlers,
}));
vi.mock('./hook', () => ({ useEditorViewportPreview: mocks.preview }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storeState.viewportPreviewOpen = true;
  mocks.storeState.viewport = { canvasHeight: 100, canvasWidth: 200 };
});

it('renders embedded preview from controller canvas when forced open', () => {
  const markup = renderToStaticMarkup(
    <EditorViewportPreview hasImage forceOpen variant="embedded" />
  );

  expect(markup).toContain('role="button"');
  expect(markup).toContain('width:96px');
  expect(mocks.preview).toHaveBeenCalledWith(
    expect.objectContaining({ hasImage: true, viewportPreviewOpen: true })
  );
});

it('passes optional max width into the preview hook and renders floating shell', () => {
  const markup = renderToStaticMarkup(<EditorViewportPreview hasImage maxWidth={144} />);

  expect(markup).toContain('editor.viewport-preview.root');
  expect(mocks.preview).toHaveBeenCalledWith(
    expect.objectContaining({ maxWidth: 144, viewportPreviewOpen: true })
  );
});

it('omits preview when closed or when viewport has no canvas dimensions', () => {
  mocks.storeState.viewportPreviewOpen = false;
  expect(renderToStaticMarkup(<EditorViewportPreview hasImage />)).toBe('');

  mocks.storeState.viewportPreviewOpen = true;
  mocks.storeState.viewport = { canvasHeight: 0, canvasWidth: 0 };
  expect(renderToStaticMarkup(<EditorViewportPreview hasImage />)).toBe('');
});
