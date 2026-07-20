// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actionButtonMock: vi.fn(),
  useVideoActiveViewModel: vi.fn(),
}));

vi.mock('../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => `t:${key}`,
}));

vi.mock('../../../../ui/popup-shell/action-button', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../ui/popup-shell/action-button')>()),
  PopupActionButton: (props: {
    compact?: boolean;
    disabled?: boolean;
    label: string;
    onClick: () => void;
  }) => {
    mocks.actionButtonMock(props);
    return (
      <button
        type="button"
        disabled={props.disabled}
        data-compact={props.compact}
        onClick={props.onClick}
      >
        {props.label}
      </button>
    );
  },
}));

vi.mock('../active-page/view-model', (_importOriginal) => ({
  useVideoActiveViewModel: mocks.useVideoActiveViewModel,
}));

import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { VideoActiveFooterControls } from './active-controls';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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
  mocks.actionButtonMock.mockReset();
  mocks.useVideoActiveViewModel.mockReset();
  mocks.useVideoActiveViewModel.mockReturnValue({
    canControl: true,
    isBusy: false,
    isPaused: false,
    modeLabel: 'Tab',
    sourceLabel: 'Current tab',
    value: '00:12',
    viewportPresetLabel: null,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders shared popup action controls and asks before discarding', () => {
  const onPauseResume = vi.fn();
  const onStop = vi.fn();
  const onCancel = vi.fn();

  renderNode(
    <VideoActiveFooterControls
      recordingState={{
        captureMode: null,
        captureSource: null,
        countdownEndsAt: null,
        duration: 12,
        error: null,
        status: VideoRecordingStatus.RECORDING,
        viewportPreset: null,
      }}
      onPauseResume={onPauseResume}
      onStop={onStop}
      onCancel={onCancel}
    />
  );

  const buttons = Array.from(container?.querySelectorAll('button') ?? []);

  expect(container?.textContent).toContain('t:popup.video.pauseButton');
  expect(container?.textContent).toContain('t:popup.video.stopButton');
  expect(container?.textContent).toContain('t:popup.video.cancelButton');
  expect(buttons[2]?.getAttribute('data-compact')).toBe('true');

  act(() => {
    buttons[0]?.click();
    buttons[1]?.click();
    buttons[2]?.click();
  });

  expect(container?.textContent).toContain('t:popup.video.cancelContinueRecording');
  expect(container?.textContent).toContain('t:popup.video.cancelDeleteRecording');
  expect(onPauseResume).toHaveBeenCalledTimes(2);
  expect(onStop).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();

  const confirmButtons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  act(() => {
    confirmButtons[1]?.click();
  });

  expect(onCancel).toHaveBeenCalledTimes(1);
});

it('continues a paused recording from the cancel confirmation', () => {
  const onPauseResume = vi.fn();

  mocks.useVideoActiveViewModel.mockReturnValue({
    canControl: true,
    isBusy: false,
    isPaused: true,
    modeLabel: 'Tab',
    sourceLabel: 'Current tab',
    value: '00:12',
    viewportPresetLabel: null,
  });

  renderNode(
    <VideoActiveFooterControls
      recordingState={{
        captureMode: null,
        captureSource: null,
        countdownEndsAt: null,
        duration: 12,
        error: null,
        status: VideoRecordingStatus.PAUSED,
        viewportPreset: null,
      }}
      onPauseResume={onPauseResume}
      onStop={vi.fn()}
      onCancel={vi.fn()}
    />
  );

  let buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  act(() => {
    buttons[2]?.click();
  });

  buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  act(() => {
    buttons[0]?.click();
  });

  expect(onPauseResume).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain('t:popup.video.cancelButton');
});

it('cancels countdown immediately without showing discard confirmation', () => {
  const onCancel = vi.fn();
  const onPauseResume = vi.fn();
  mocks.useVideoActiveViewModel.mockReturnValue({
    canControl: false,
    isBusy: true,
    isPaused: false,
    modeLabel: 'Tab',
    sourceLabel: 'Current tab',
    value: '2',
    viewportPresetLabel: null,
  });

  renderNode(
    <VideoActiveFooterControls
      recordingState={{
        captureMode: null,
        captureSource: null,
        countdownEndsAt: null,
        duration: 0,
        error: null,
        status: VideoRecordingStatus.COUNTDOWN,
        viewportPreset: null,
      }}
      onPauseResume={onPauseResume}
      onStop={vi.fn()}
      onCancel={onCancel}
    />
  );

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  expect(buttons[0]?.disabled).toBe(true);
  expect(buttons[1]?.disabled).toBe(true);
  expect(buttons[2]?.disabled).toBe(false);
  expect(container?.textContent).toContain('t:popup.video.cancelButton');

  act(() => {
    buttons[2]?.click();
  });

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onPauseResume).not.toHaveBeenCalled();
  expect(container?.textContent).not.toContain('t:popup.video.cancelDeleteRecording');
});
