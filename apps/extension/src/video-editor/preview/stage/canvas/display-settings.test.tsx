// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PreviewDisplaySettings } from './display-settings';

it('offers a preview FPS limit independently from resolution and playback mode', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  const raster = vi.fn();
  const mode = vi.fn();
  try {
    act(() =>
      root.render(
        <PreviewDisplaySettings
          mode="live"
          rasterPreset="720p"
          zoom="fit"
          frameRate="project"
          onFrameRateChange={change}
          onModeChange={mode}
          onRasterPresetChange={raster}
          onZoomChange={vi.fn()}
        />
      )
    );
    act(() => host.querySelector('button')!.click());
    act(() => document.querySelector<HTMLInputElement>('input[value="15"]')!.click());
    expect(change).toHaveBeenCalledWith('15');
    expect(raster).not.toHaveBeenCalled();
    expect(mode).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
