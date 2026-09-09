// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { PreviewStageControls } from './controls';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('presents cache preparation failure separately from unavailable capability', () => {
  const markup = renderToStaticMarkup(
    <PreviewStageControls
      mode="cache"
      onModeChange={vi.fn()}
      onPreferencesRetry={vi.fn()}
      onRasterPresetChange={vi.fn()}
      onZoomChange={vi.fn()}
      preferencesSaveFailed={false}
      rasterPreset="720p"
      status={{
        completedFrames: 1,
        mode: 'cache',
        outcome: 'failed',
        phase: 'recovering',
        totalFrames: 2,
      }}
      zoom="fit"
    />
  );

  expect(markup).toContain('videoEditor.stage.previewCacheFailed');
  expect(markup).toContain('>videoEditor.stage.previewCacheFailedShort</span>');
  expect(markup).not.toContain('videoEditor.stage.previewCacheUnavailable');
  expect(markup).toContain('video.preview.display-settings');
  expect(markup).toContain(' · 720p · ');
  expect(markup).toContain('data-ui="video.preview.feedback"');
  expect(markup).not.toContain('absolute right-0 top-11');
  expect(markup).not.toContain('shared.ui.compact-select');
});

it('changes each display setting independently and restores focus when dismissed', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const modeChanged = vi.fn();
  const rasterChanged = vi.fn();
  const zoomChanged = vi.fn();
  function Settings() {
    const [mode, setMode] = useState<'live' | 'cache'>('live');
    const [raster, setRaster] =
      useState<import('../../../contracts/preview-runtime').VideoEditorPreviewRasterPreset>('720p');
    const [zoom, setZoom] =
      useState<import('../../../contracts/preview-runtime').VideoEditorPreviewZoom>('fit');
    return (
      <PreviewStageControls
        mode={mode}
        onModeChange={(value) => {
          modeChanged(value);
          setMode(value);
        }}
        rasterPreset={raster}
        onRasterPresetChange={(value) => {
          rasterChanged(value);
          setRaster(value);
        }}
        zoom={zoom}
        onZoomChange={(value) => {
          zoomChanged(value);
          setZoom(value);
        }}
        preferencesSaveFailed={false}
        onPreferencesRetry={vi.fn()}
        status={{ completedFrames: 0, totalFrames: 0, mode: 'live', phase: 'idle' }}
      />
    );
  }
  try {
    act(() => root.render(<Settings />));
    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-ui="video.preview.display-settings"]'
    )!;
    act(() => trigger.click());
    expect(document.querySelectorAll('fieldset')).toHaveLength(4);
    expect(document.querySelectorAll('input:checked')).toHaveLength(4);
    expect(document.activeElement).toBe(document.querySelector('input:checked'));
    for (const value of ['1080p', '75%', 'cache']) {
      act(() => document.querySelector<HTMLInputElement>(`input[value="${value}"]`)!.click());
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
    }
    expect(rasterChanged).toHaveBeenCalledExactlyOnceWith('1080p');
    expect(zoomChanged).toHaveBeenCalledExactlyOnceWith('75%');
    expect(modeChanged).toHaveBeenCalledExactlyOnceWith('cache');
    expect(trigger.textContent).toContain('1080p · 75%');
    act(() =>
      document
        .querySelector('[role="dialog"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    act(() => trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
    expect(document.querySelector<HTMLInputElement>('input[value="1080p"]')!.checked).toBe(true);
    act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
