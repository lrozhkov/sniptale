// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderAudioRecordingTrimPanel } from './trim';

const peaks = vi.hoisted(() => vi.fn());
vi.mock('../../project/media-metadata/audio-peaks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../project/media-metadata/audio-peaks')>()),
  loadAudioPeaks: peaks,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
const blob = new Blob(['audio']);
const play = vi.fn();
const pause = vi.fn();
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
function Subject({ disabled = false, url = 'blob:first' }: { disabled?: boolean; url?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(4);
  const [recordedDuration, setRecordedDuration] = useState(4);
  return renderAudioRecordingTrimPanel(
    {
      audioRef,
      audioUrl: url,
      audioBlob: blob,
      recordedDuration,
      resolveDuration: setRecordedDuration,
      trimStart,
      trimEnd,
      selectRange: (range) => {
        setTrimStart(range.start);
        setTrimEnd(range.end);
      },
      isPlayingSelection: false,
      playSelection: play,
      pauseSelection: pause,
    },
    disabled
  );
}
const render = async (disabled = false, url = 'blob:first') => {
  await act(async () => root.render(<Subject disabled={disabled} url={url} />));
};
function pointer(target: Element, type: string, x: number) {
  const event = new MouseEvent(type, { clientX: x, button: 0, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => target.dispatchEvent(event));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 100,
    width: 400,
    height: 100,
    toJSON: () => ({}),
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  });
  peaks.mockReset().mockResolvedValue([0.2, 0.8, 0.4]);
  play.mockReset().mockResolvedValue(undefined);
  pause.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('uses one transport and waveform range instead of browser controls or numeric trim fields', async () => {
  await render();
  expect(host.querySelector('audio')!.controls).toBe(false);
  expect(host.querySelector('audio')!.hidden).toBe(true);
  expect(host.querySelectorAll('input')).toHaveLength(0);
  expect(host.querySelectorAll('button[title="videoEditor.timeline.play"]')).toHaveLength(1);
  expect(
    host.querySelector('[data-ui="video-editor.source-waveform"] path')!.getAttribute('d')
  ).toContain('M');
  const lane = host.querySelector('[data-ui="video-editor.source-lane"]')!;
  pointer(lane, 'pointerdown', 300);
  pointer(lane, 'pointermove', 100);
  pointer(lane, 'pointerup', 100);
  const range = host.querySelector('[data-ui="video-editor.source-range"]')!;
  expect(range.getAttribute('data-in')).toBe('1');
  expect(range.getAttribute('data-out')).toBe('3');
  act(() =>
    host.querySelector<HTMLButtonElement>('button[title="videoEditor.timeline.play"]')!.click()
  );
  expect(play).toHaveBeenCalledOnce();
  act(() =>
    host.querySelector<HTMLButtonElement>('button[title="videoEditor.app.sourceReset"]')!.click()
  );
  expect(range.getAttribute('data-in')).toBe('0');
  expect(range.getAttribute('data-out')).toBe('4');
  await render(true);
  pointer(lane, 'pointerdown', 100);
  pointer(lane, 'pointermove', 300);
  pointer(lane, 'pointerup', 300);
  expect(range.getAttribute('data-out')).toBe('4');
  expect(
    host.querySelector<HTMLButtonElement>('button[title="videoEditor.timeline.play"]')!.disabled
  ).toBe(true);
});
it('ignores late waveform data after replacing the recording and permits selection without peaks', async () => {
  let complete!: (value: number[]) => void;
  peaks
    .mockImplementationOnce(
      () =>
        new Promise<number[]>((resolve) => {
          complete = resolve;
        })
    )
    .mockResolvedValueOnce(null);
  await render();
  await render(false, 'blob:second');
  await act(async () => complete([1, 1, 1]));
  expect(host.textContent).toContain('recordAudioWaveformUnavailable');
  expect(
    host.querySelector('[data-ui="video-editor.source-waveform"] path')!.getAttribute('d')
  ).toBe('');
  const lane = host.querySelector('[data-ui="video-editor.source-lane"]')!;
  pointer(lane, 'pointerdown', 100);
  pointer(lane, 'pointermove', 200);
  pointer(lane, 'pointerup', 200);
  expect(
    host.querySelector('[data-ui="video-editor.source-range"]')!.getAttribute('data-out')
  ).toBe('2');
});
