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

it('preserves canvas, seek position and shared zoom across fullscreen transitions', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
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
    expect(footer?.textContent).toContain('75%');
    const fitButton = Array.from(footer?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) => button.textContent?.includes('videoEditor.stage.previewZoomFit')
    );
    expect(fitButton).toBeDefined();
    await act(() => fitButton?.click());
    expect(onPreviewZoomChange).toHaveBeenCalledExactlyOnceWith('fit');
    expect(footer?.querySelector('input[type="range"]')?.getAttribute('value')).toBe('1');
    await render(false);
    expect(
      host.querySelector('[data-ui="video-editor.preview.fullscreen-transport"]')?.textContent
    ).toContain('75%');
    await render(true);
    expect(host.querySelector('canvas')).toBe(canvas);
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
