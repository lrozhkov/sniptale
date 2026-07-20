// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helpers')>()),
  getVideoActiveIdleLabel: (isBusy: boolean) => `idle:${isBusy}`,
  getVideoActivePauseResumeLabel: (isPaused: boolean) => `toggle:${isPaused}`,
  getVideoActiveStopLabel: ({ canControl }: { canControl: boolean }) => `stop:${canControl}`,
}));

import { VideoActiveControls } from './layout';
import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function createRecordingState(
  status: VideoRecordingStatus,
  overrides: Partial<VideoRecordingRuntimeState> = {}
): VideoRecordingRuntimeState {
  return {
    status,
    duration: 42,
    countdownEndsAt: null,
    captureMode: null,
    captureSource: null,
    viewportPreset: null,
    error: null,
    ...overrides,
  };
}

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('video active page controls owner module', () => {
  it('renders pause/resume and stop controls when control is available', () => {
    const onPauseResume = vi.fn();
    const onStop = vi.fn();

    renderNode(
      <VideoActiveControls
        recordingState={createRecordingState(VideoRecordingStatus.RECORDING)}
        isPaused={false}
        canControl
        isBusy={false}
        onPauseResume={onPauseResume}
        onStop={onStop}
      />
    );

    const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

    expect(container?.textContent).toContain('toggle:false');
    expect(container?.textContent).toContain('stop:true');

    act(() => {
      buttons[0]?.click();
      buttons[1]?.click();
    });

    expect(onPauseResume).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('renders the idle fallback when control is unavailable', () => {
    renderNode(
      <VideoActiveControls
        recordingState={createRecordingState(VideoRecordingStatus.PAUSED)}
        isPaused
        canControl={false}
        isBusy
        onPauseResume={() => undefined}
        onStop={() => undefined}
      />
    );

    expect(container?.textContent).toContain('idle:true');
    expect(container?.textContent).toContain('stop:false');
  });
});
