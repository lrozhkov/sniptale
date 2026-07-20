import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PreviewStageFrame } from './layout';

vi.mock('../../../../platform/i18n/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/index')>()),
  translate: (key: string) => key,
}));

function verifyPreviewFrameHostsZoomableStageContent() {
  const markup = renderToStaticMarkup(
    <PreviewStageFrame>
      <div data-testid="stage-content" />
    </PreviewStageFrame>
  );

  expect(markup).toContain('absolute inset-4 min-h-0');
  expect(markup).toContain('absolute right-4 top-4');
  expect(markup).toContain('data-ui="video.preview.viewport"');
  expect(markup).toContain('[container-type:size]');
  expect(markup).toContain('flex h-full w-full items-center justify-center');
  expect(markup).toContain('data-ui="video.preview.controls"');
  expect(markup).toContain('videoEditor.stage.enterFullscreen');
  expect(markup).toContain('data-testid="stage-content"');
  expect(markup).not.toContain('videoEditor.sidebar.sceneProperties');
  expect(markup).not.toContain('videoEditor.stage.addRailTitle');
}

describe('preview-stage/layout', () => {
  it(
    'wraps the stage in a scrollable zoom surface inside the preview frame',
    verifyPreviewFrameHostsZoomableStageContent
  );
});
