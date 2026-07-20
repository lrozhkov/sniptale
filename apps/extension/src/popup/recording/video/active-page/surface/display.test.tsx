// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { VideoActiveDisplay } from './display';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderDisplay(viewportPresetLabel: string | null = 'HD 1280x720') {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <VideoActiveDisplay
        recordingState={{
          captureMode: null,
          captureSource: null,
          countdownEndsAt: null,
          duration: 8,
          error: null,
          status: VideoRecordingStatus.RECORDING,
          viewportPreset: null,
        }}
        sourceLabel="Example Domain"
        value="00:08"
        viewportPresetLabel={viewportPresetLabel}
      />
    );
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('renders the recording value, source, and active preset pill', () => {
  renderDisplay();

  expect(container?.textContent).toContain('00:08');
  expect(container?.textContent).toContain('Example Domain');
  expect(container?.textContent).toContain('HD 1280x720');
});

it('omits the preset pill when no viewport preset is active', () => {
  renderDisplay(null);

  expect(container?.textContent).not.toContain('HD 1280x720');
});
