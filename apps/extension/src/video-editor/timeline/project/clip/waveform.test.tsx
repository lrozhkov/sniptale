// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AudioClipWaveform } from './waveform';
import { buildAudioClipWaveformPath } from '../canvas/render-data';
vi.mock('../canvas/render-data', async (original) => {
  const actual = await original<typeof import('../canvas/render-data')>();
  return { ...actual, buildAudioClipWaveformPath: vi.fn(actual.buildAudioClipWaveformPath) };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('renders non-empty waveform peaks as one filled path', () => {
  renderWaveform({ peaks: [0.2, 0.75] });

  expect(container?.querySelectorAll('rect')).toHaveLength(0);
  expect(container?.querySelectorAll('path[fill="currentColor"]')).toHaveLength(1);
  expect(container?.querySelector('path[fill="currentColor"]')?.getAttribute('d')).toContain('Z');
});

it('keeps the empty waveform fallback and envelope overlay', () => {
  renderWaveform({ muted: true, peaks: [] });

  expect(container?.querySelector('rect')).toBeNull();
  expect(container?.querySelector('path[fill="currentColor"]')).toBeNull();
  expect(container?.querySelector('path[fill="none"]')).not.toBeNull();
});

function renderWaveform(props: { muted?: boolean; peaks: number[] }) {
  act(() => {
    root?.render(
      <AudioClipWaveform
        envelopeEnd={1}
        envelopeStart={0.4}
        muted={props.muted ?? false}
        peaks={props.peaks}
      />
    );
  });
}

it('reuses waveform geometry while mute and envelope styling change, and replaces it for new peaks', () => {
  const peaks = [0.2, 0.75];
  vi.mocked(buildAudioClipWaveformPath).mockClear();
  renderWaveform({ peaks });
  const path = container?.querySelector('path[fill="currentColor"]')?.getAttribute('d');
  renderWaveform({ peaks, muted: true });
  expect(buildAudioClipWaveformPath).toHaveBeenCalledOnce();
  expect(container?.querySelector('path[fill="currentColor"]')?.getAttribute('d')).toBe(path);
  renderWaveform({ peaks: [0.9, 0.1] });
  expect(buildAudioClipWaveformPath).toHaveBeenCalledTimes(2);
  expect(container?.querySelector('path[fill="currentColor"]')?.getAttribute('d')).not.toBe(path);
});
