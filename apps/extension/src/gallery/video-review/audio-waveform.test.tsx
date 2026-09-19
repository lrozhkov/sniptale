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
