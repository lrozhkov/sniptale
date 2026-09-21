// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewAudioWaveform, useReviewWaveforms } from './audio-waveform';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
const mocks = vi.hoisted(() => ({ load: vi.fn(), resolve: vi.fn() }));
vi.mock('../../workflows/video-review/waveform', () => ({ loadReviewWaveform: mocks.load }));
vi.mock('../../workflows/video-review/asset-bytes', () => ({
  resolveReviewAssetBytes: mocks.resolve,
}));
vi.mock('../../features/media-hub/events', () => ({
  subscribeToMediaHubEvents: () => () => undefined,
}));
it('plots actual trimmed peaks and gain instead of decorative stripes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const wave = { duration: 4, peaks: [0, 0, 1, 1] };
  try {
    await act(async () =>
      root.render(
        <ReviewAudioWaveform waveform={wave} offset={0} duration={2} volume={1} muted={false} />
      )
    );
    const quiet = host.querySelector('path')!.getAttribute('d');
    await act(async () =>
      root.render(
        <ReviewAudioWaveform waveform={wave} offset={2} duration={2} volume={1} muted={false} />
      )
    );
    const loud = host.querySelector('path')!.getAttribute('d');
    expect(loud).not.toBe(quiet);
    expect(loud).toContain('6.00V94.00');
    await act(async () =>
      root.render(
        <ReviewAudioWaveform waveform={wave} offset={2} duration={2} volume={0} muted={true} />
      )
    );
    expect(host.querySelector('path')!.getAttribute('d')).toBe(quiet);
    expect(host.querySelector('svg')!.style.opacity).toBe('0.2');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
it('ignores stale source decoding and reuses peaks across playback rerenders', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.load.mockReset();
  const host = document.createElement('div');
  const root = createRoot(host);
  const first = new Blob(['first']);
  const second = new Blob(['second']);
  let resolveFirst!: (value: { duration: number; peaks: number[] }) => void;
  mocks.load.mockImplementation((source: Blob) =>
    source === first
      ? new Promise((resolve) => {
          resolveFirst = resolve;
        })
      : Promise.resolve({ duration: 4, peaks: [0.7] })
  );
  let current: ReturnType<typeof useReviewWaveforms>;
  function Harness({ source }: { source: Blob }) {
    current = useReviewWaveforms(source, 4, createQuickEditAdvancedState().audio, true);
    return null;
  }
  try {
    await act(async () => root.render(<Harness source={first} />));
    await act(async () => root.render(<Harness source={second} />));
    await act(async () => resolveFirst({ duration: 4, peaks: [0.1] }));
    expect(current!.get('original')?.peaks).toEqual([0.7]);
    await act(async () => root.render(<Harness source={second} />));
    expect(mocks.load).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('uses the displayed width rather than a fixed 240-column envelope', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const wave = {
    duration: 60,
    peaks: Array.from({ length: 6000 }, (_, i) => (i === 3000 ? 1 : 0)),
  };
  try {
    await act(async () =>
      root.render(<ReviewAudioWaveform waveform={wave} duration={60} volume={1} muted={false} />)
    );
    const path = host.querySelector('path')!.getAttribute('d')!;
    expect((path.match(/M/g) ?? []).length).toBeGreaterThan(240);
    expect(path).toContain('6.00V94.00');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('refines a trimmed long-file window and discards a replaced source response', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  let resolve!: (value: { start: number; end: number; peaks: number[] }) => void;
  const loadWindow = vi.fn(
    (_start: number, _end: number, _count: number, _signal: AbortSignal) =>
      new Promise<{ start: number; end: number; peaks: number[] }>((done) => {
        resolve = done;
      })
  );
  const wave = { duration: 3600, peaks: new Array<number>(30000).fill(0), loadWindow };
  try {
    await act(async () =>
      root.render(
        <ReviewAudioWaveform waveform={wave} offset={1200} duration={10} volume={1} muted={false} />
      )
    );
    expect(loadWindow).toHaveBeenCalledWith(1200, 1210, 640, expect.any(AbortSignal));
    await act(async () =>
      root.render(
        <ReviewAudioWaveform
          waveform={{ duration: 10, peaks: [0] }}
          duration={10}
          volume={1}
          muted={false}
        />
      )
    );
    expect(loadWindow.mock.calls[0]![3].aborted).toBe(true);
    await act(async () => resolve({ start: 1200, end: 1210, peaks: [1] }));
    expect(host.querySelector('path')!.getAttribute('d')).not.toContain('6.00V94.00');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
