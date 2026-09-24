import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { CanvasEmptyState, CanvasViewport } from './views';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('./raster-overlay', () => ({
  EditorRasterOverlay: () => <div data-ui="mock.raster-overlay" />,
}));
vi.mock('../../frame-annotation/plane', () => ({
  EditorFrameAnnotationPlane: () => <div data-ui="mock.frame-plane" />,
}));

it('renders the pannable image viewport with checkerboard surface and grid overlay', () => {
  const markup = renderToStaticMarkup(
    <CanvasViewport
      hasImage
      backgroundColor="#f5f5f5"
      canvasRef={{ current: null }}
      viewportRef={{ current: null }}
      stageRef={{ current: null }}
      surfaceRef={{ current: null }}
      gridStyle={{ backgroundSize: '10px 10px' }}
    />
  );

  expect(markup).toContain('editor.canvas.viewport');
  expect(markup).toContain('overflow-auto');
  expect(markup).toContain('max(48rem, 130vw)');
  expect(markup).toContain('background-size:10px 10px');
  expect(markup).not.toContain('mock.raster-overlay');
});

it('keeps the viewport inert and hides image-only styling before an image is loaded', () => {
  const markup = renderToStaticMarkup(
    <CanvasViewport
      hasImage={false}
      backgroundColor="#f5f5f5"
      canvasRef={{ current: null }}
      viewportRef={{ current: null }}
      stageRef={{ current: null }}
      surfaceRef={{ current: null }}
      gridStyle={{ backgroundSize: '10px 10px' }}
    />
  );

  expect(markup).toContain('pointer-events-none');
  expect(markup).not.toContain('background-size:10px 10px');
});

it('shows a muted, nonblocking workspace around the image rectangle', () => {
  const markup = renderToStaticMarkup(
    <CanvasViewport
      hasImage
      backgroundColor="#f5f5f5"
      canvasRef={{ current: null }}
      viewportRef={{ current: null }}
      stageRef={{ current: null }}
      controller={{ canvasDocumentSize: { width: 100, height: 80 } } as never}
      gridStyle={null}
    />
  );

  expect(markup).toContain('editor.canvas.document-boundary');
  expect(markup).toContain('editor.canvas.document-checkerboard');
  expect(markup).toContain('editor.canvas.workspace-mask-left');
  expect(markup).toContain('top:46.3768115942029%;bottom:46.3768115942029%');
  expect(markup.match(/background-image:/g)).toHaveLength(1);
  expect(markup).toContain('background-color:#f5f5f5');
  expect(markup.match(/pointer-events-none absolute z-40/g)).toHaveLength(5);
  expect(markup).toContain('mock.frame-plane');
});

it('renders the active empty dropzone without exposing the hidden viewport', () => {
  const markup = renderToStaticMarkup(
    <CanvasEmptyState dragActive onOpenImage={vi.fn()} onDrop={vi.fn()} />
  );

  expect(markup).toContain('editor.canvas.emptyDropzoneActive');
  expect(markup).toContain('editor.canvas.openImage');
});
