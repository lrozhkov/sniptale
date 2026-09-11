// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  createPreviewFrameRateCounter,
  PreviewFrameRateProvider,
  PreviewFrameRateReadout,
  usePreviewFrameRate,
} from './frame-rate';
import { PreviewDisplaySettings } from './canvas/display-settings';

it('measures completed frames over real elapsed time and resets after a stall', () => {
  let time = 0;
  const counter = createPreviewFrameRateCounter(() => time);
  for (let index = 0; index < 15; index++) counter.record();
  time = 500;
  expect(counter.sample()).toBe(30);
  time = 1500;
  expect(counter.sample()).toBe(0);
  counter.record();
  counter.reset();
  time = 2000;
  expect(counter.sample()).toBe(0);
});

function RecordFrame() {
  const rate = usePreviewFrameRate();
  return <button data-record onClick={() => rate?.record()} />;
}

it('shows live FPS, preserves the disabled Cache preference, and cleans up its timer', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness({ live, playing }: { live: boolean; playing: boolean }) {
    const [enabled, setEnabled] = useState(false);
    return (
      <PreviewFrameRateProvider
        enabled={enabled}
        live={live}
        playing={playing}
        onChange={setEnabled}
      >
        <PreviewDisplaySettings
          mode={live ? 'live' : 'cache'}
          rasterPreset="720p"
          zoom="fit"
          onModeChange={vi.fn()}
          onRasterPresetChange={vi.fn()}
          onZoomChange={vi.fn()}
        />
        {live && <PreviewFrameRateReadout />}
        <RecordFrame />
      </PreviewFrameRateProvider>
    );
  }
  try {
    act(() => root.render(<Harness live playing />));
    act(() => host.querySelector<HTMLButtonElement>('button')!.click());
    const checkbox = () => document.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(checkbox().checked).toBe(false);
    act(() => checkbox().click());
    for (let i = 0; i < 10; i++)
      act(() => host.querySelector<HTMLButtonElement>('[data-record]')!.click());
    act(() => vi.advanceTimersByTime(500));
    expect(host.querySelector('[data-ui="video.preview.actual-fps"]')?.textContent).toBe('20 FPS');
    act(() => root.render(<Harness live playing={false} />));
    expect(host.querySelector('[data-ui="video.preview.actual-fps"]')?.textContent).toBe('— FPS');
    act(() => root.render(<Harness live={false} playing />));
    expect(checkbox().disabled).toBe(true);
    act(() => checkbox().click());
    expect(checkbox().checked).toBe(true);
    expect(host.querySelector('[data-ui="video.preview.actual-fps"]')).toBeNull();
    act(() => root.render(<Harness live playing />));
    expect(checkbox().checked).toBe(true);
    act(() => vi.advanceTimersByTime(500));
    expect(host.querySelector('[data-ui="video.preview.actual-fps"]')?.textContent).toBe('0 FPS');
  } finally {
    act(() => root.unmount());
    host.remove();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
