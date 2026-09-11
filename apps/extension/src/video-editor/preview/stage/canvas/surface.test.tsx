// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { PreviewStageSurfaceProps } from '../types';
import { PreviewStageSurface } from './surface';

vi.mock('./', () => ({ PreviewStageCanvas: () => null }));
vi.mock('./layout', () => ({
  PreviewStageFrame: (props: { previewFrameRate?: string }) => (
    <span data-fps={props.previewFrameRate} />
  ),
}));
vi.mock('./fullscreen', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./fullscreen')>()),
  usePreviewStageFullscreen: () => ({
    isFullscreen: false,
    openFullscreen: vi.fn(),
    closeFullscreen: vi.fn(),
  }),
}));

it('passes the FPS preference into the preview header', () => {
  const props = {
    project: { duration: 3 },
    previewFrameRate: '15',
    effectRuntimeFeedback: { failed: false },
  } as PreviewStageSurfaceProps;
  expect(renderToStaticMarkup(<PreviewStageSurface {...props} />)).toContain('data-fps="15"');
});
