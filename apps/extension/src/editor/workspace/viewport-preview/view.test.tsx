import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: vi.fn((key: string) => `t:${key}`),
}));

import { EditorViewportPreviewSurface } from './view';

function createProps(overrides: Partial<ComponentProps<typeof EditorViewportPreviewSurface>> = {}) {
  return {
    onKeyDown: vi.fn(),
    onPointerCancel: vi.fn(),
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    previewCanvasRef: null,
    previewSize: { height: 64, width: 96 },
    previewSurfaceRef: null,
    surfaceClassName: 'surface-class',
    viewportFrame: { height: 20, left: 10, top: 5, width: 30 },
    ...overrides,
  };
}

it('renders preview surface metadata and viewport frame', () => {
  const markup = renderToStaticMarkup(<EditorViewportPreviewSurface {...createProps()} />);

  expect(markup).toContain('t:editor.toolbar.previewNavigation');
  expect(markup).toContain('editor.viewport-preview.root');
  expect(markup).toContain('surface-class');
  expect(markup).toContain('canvas');
  expect(markup).toContain('top-3');
  expect(markup).toContain('right-3');
  expect(markup).toContain('width:96px');
  expect(markup).toContain('left:10px');
});

it('omits the viewport frame when it is not available', () => {
  const markup = renderToStaticMarkup(
    <EditorViewportPreviewSurface {...createProps({ viewportFrame: null })} />
  );

  expect(markup).not.toContain('border-[var(--sniptale-color-border-accent-strong)]');
});
