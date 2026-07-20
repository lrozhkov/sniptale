// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../copy', (_importOriginal) => ({
  getRecordingStatusLabel: (status: string) => `status:${status}`,
}));

import {
  VideoActiveControls,
  VideoActiveDisplay,
  VideoActiveError,
  VideoActiveStatusHeader,
} from './index';
import { getVideoActiveIdleLabel, getVideoActivePauseResumeLabel } from '../helpers';
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

function renderActiveRecordingView(props: {
  recordingState: VideoRecordingRuntimeState;
  onPauseResume: () => void;
  onStop: () => void;
}) {
  renderNode(
    <>
      <VideoActiveStatusHeader recordingState={props.recordingState} modeLabel="Current tab" />
      <VideoActiveDisplay
        recordingState={props.recordingState}
        value="00:42"
        sourceLabel="example.com"
        viewportPresetLabel="1280x720"
      />
      <VideoActiveError error={props.recordingState.error} />
      <VideoActiveControls
        recordingState={props.recordingState}
        isPaused={false}
        canControl
        isBusy={false}
        onPauseResume={props.onPauseResume}
        onStop={props.onStop}
      />
    </>
  );
}

function renderIdleView(recordingState: VideoRecordingRuntimeState) {
  renderNode(
    <>
      <VideoActiveDisplay
        recordingState={recordingState}
        value="01:05"
        sourceLabel="Desktop"
        viewportPresetLabel={null}
      />
      <VideoActiveError error={null} />
      <VideoActiveControls
        recordingState={recordingState}
        isPaused
        canControl={false}
        isBusy
        onPauseResume={() => undefined}
        onStop={() => undefined}
      />
    </>
  );
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

describe('VideoActivePage views', () => {
  it('renders the active recording surface and wires both control buttons', () => {
    const onPauseResume = vi.fn();
    const onStop = vi.fn();
    const recordingState = createRecordingState(VideoRecordingStatus.STOPPING, {
      error: 'Stop failed',
    });

    renderActiveRecordingView({ recordingState, onPauseResume, onStop });

    expect(container?.textContent).toContain('Current tab');
    expect(container?.textContent).toContain('00:42');
    expect(container?.textContent).toContain('example.com');
    expect(container?.textContent).toContain('1280x720');
    expect(container?.textContent).toContain('Stop failed');
    expect(container?.textContent).toContain(getVideoActivePauseResumeLabel(false));

    const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

    expect(buttons).toHaveLength(2);

    act(() => {
      buttons[0]?.click();
      buttons[1]?.click();
    });

    expect(onPauseResume).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('renders the idle fallback when controls are unavailable', () => {
    const recordingState = createRecordingState(VideoRecordingStatus.PAUSED);

    renderIdleView(recordingState);

    expect(container?.textContent).toContain('01:05');
    expect(container?.textContent).toContain('Desktop');
    expect(container?.textContent).not.toContain('1280x720');
    expect(container?.textContent).toContain(getVideoActiveIdleLabel(true));
    expect(container?.querySelectorAll('button')).toHaveLength(1);
  });
});
