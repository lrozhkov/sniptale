// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AudioClipWaveform } from './waveform';

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
