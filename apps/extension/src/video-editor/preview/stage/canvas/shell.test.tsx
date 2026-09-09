// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/index')>()),
  translate: (key: string) => key,
}));

import { PreviewStageShellLayout } from './shell';

describe('preview-stage/shell', () => {
  it('retains the header focus and both viewer nodes when the workspace changes context', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = (active: boolean) =>
      act(() => {
        root.render(
          <PreviewStageShellLayout
            currentTime={0}
            duration={10}
            isFullscreen={false}
            isPlaying={false}
            playbackRange={null}
            headerContent={<button data-testid="context-switch">Source / Timeline</button>}
            alternateView={{ active, content: <video data-testid="source" /> }}
          >
            <canvas data-testid="montage" />
          </PreviewStageShellLayout>
        );
      });
    try {
      await render(false);
      const button = host.querySelector<HTMLButtonElement>('[data-testid="context-switch"]')!;
      const source = host.querySelector('[data-testid="source"]')!;
      const montage = host.querySelector('[data-testid="montage"]')!;
      button.focus();
      for (const active of [true, false]) {
        await render(active);
        expect(document.activeElement).toBe(button);
        expect(host.querySelector('[data-testid="source"]')).toBe(source);
        expect(host.querySelector('[data-testid="montage"]')).toBe(montage);
        expect(source.closest('[hidden]') !== null).toBe(!active);
        expect(montage.closest('[hidden]') !== null).toBe(active);
      }
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  });

  it.each([false, true])(
    'keeps workspace context out of native fullscreen (%s)',
    (isFullscreen) => {
      const markup = renderToStaticMarkup(
        <PreviewStageShellLayout
          currentTime={0}
          duration={10}
          isFullscreen={isFullscreen}
          isPlaying={false}
          playbackRange={null}
          headerContent={<button>Source context</button>}
        >
          <div>Edited image</div>
        </PreviewStageShellLayout>
      );
      expect(markup.includes('Source context')).toBe(!isFullscreen);
      expect(markup.includes('video.preview.header')).toBe(!isFullscreen);
      expect(markup.includes('video.preview.controls')).toBe(!isFullscreen);
      expect(markup).toContain('Edited image');
    }
  );

  it('renders the fullscreen stage action with shared content toolbar chrome', () => {
    const markup = renderToStaticMarkup(
      <PreviewStageShellLayout
        currentTime={0}
        duration={10}
        isFullscreen={false}
        isPlaying={false}
        playbackRange={null}
        onOpenFullscreen={() => undefined}
      >
        <div>Stage</div>
      </PreviewStageShellLayout>
    );

    expect(markup).toContain('videoEditor.stage.enterFullscreen');
    expect(markup).toContain('data-ui="video-editor.preview.fullscreen-toggle"');
    expect(markup).toContain('sniptale-glass-toolbar-button');
    expect(markup).toContain('!w-9');
  });
});

it('keeps the canvas mounted and the footer outside the zoom viewport, with local zoom reset on exit', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onPreviewZoomChange = vi.fn();
  const render = (isFullscreen: boolean) =>
    act(() =>
      root.render(
        <PreviewStageShellLayout
          currentTime={1}
          duration={10}
          isFullscreen={isFullscreen}
          isPlaying={false}
          playbackRange={null}
          previewZoom="75%"
          onPreviewZoomChange={onPreviewZoomChange}
        >
          <canvas data-testid="persistent-canvas" />
        </PreviewStageShellLayout>
      )
    );
  try {
    await render(false);
    const canvas = host.querySelector('canvas');
    await render(true);
    expect(host.querySelector('canvas')).toBe(canvas);
    const footer = host.querySelector('[data-ui="video-editor.preview.fullscreen-transport"]');
    expect(footer?.closest('[data-ui="video.preview.viewport"]')).toBeNull();
    const zoom = host.querySelector<HTMLInputElement>('input[max="2"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(zoom, '1.5');
      zoom.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(footer?.textContent).toContain('150%');
    expect(onPreviewZoomChange).not.toHaveBeenCalled();
    await render(false);
    await render(true);
    expect(host.querySelector<HTMLInputElement>('input[max="2"]')?.value).toBe('1');
    expect(host.querySelector('canvas')).toBe(canvas);
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
