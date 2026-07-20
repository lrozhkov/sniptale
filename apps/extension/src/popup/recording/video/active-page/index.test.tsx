// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  controlsMock: vi.fn(),
  displayMock: vi.fn(),
  errorMock: vi.fn(),
  headerMock: vi.fn(),
}));

vi.mock('../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => `t:${key}`,
}));

vi.mock('../copy', (_importOriginal) => ({
  describeCaptureSource: vi.fn(() => 'Example source'),
  formatDuration: vi.fn((value: number) => `duration:${value}`),
  getCaptureModeLabels: vi.fn(() => ({
    TAB: 'Tab',
    TAB_CROP: 'Area',
    VIEWPORT_EMULATION: 'Preset',
    SCREEN: 'Screen',
  })),
  getViewportPresetLabel: vi.fn(() => 'Preset 1280x720'),
}));

vi.mock('./surface', (_importOriginal) => ({
  ACTIVE_PANEL_CLASS_NAME: 'active-panel',
  VideoActiveControls: (props: unknown) => {
    mocks.controlsMock(props);
    return <div data-testid="controls" />;
  },
  VideoActiveDisplay: (props: unknown) => {
    mocks.displayMock(props);
    return <div data-testid="display" />;
  },
  VideoActiveError: (props: unknown) => {
    mocks.errorMock(props);
    return <div data-testid="error" />;
  },
  VideoActiveStatusHeader: (props: unknown) => {
    mocks.headerMock(props);
    return <div data-testid="header" />;
  },
}));

import VideoActivePage from './index';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-26T09:00:00.000Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.controlsMock.mockReset();
  mocks.displayMock.mockReset();
  mocks.errorMock.mockReset();
  mocks.headerMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createRecordingState(
  overrides: Partial<React.ComponentProps<typeof VideoActivePage>['recordingState']>
) {
  return {
    status: VideoRecordingStatus.RECORDING,
    duration: 12,
    countdownEndsAt: null,
    captureMode: CaptureMode.TAB,
    captureSource: null,
    viewportPreset: null,
    error: null,
    ...overrides,
  };
}

async function verifiesPreparingState() {
  await renderNode(
    <VideoActivePage
      recordingState={createRecordingState({
        status: VideoRecordingStatus.PREPARING,
        error: 'Failed',
      })}
      onPauseResume={() => undefined}
      onStop={() => undefined}
    />
  );

  expect(mocks.headerMock).toHaveBeenCalledWith(
    expect.objectContaining({ modeLabel: 'Tab', recordingState: expect.any(Object) })
  );
  expect(mocks.displayMock).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceLabel: 'Example source',
      value: '...',
      viewportPresetLabel: 'Preset 1280x720',
    })
  );
  expect(mocks.errorMock).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed' }));
  expect(mocks.controlsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      canControl: false,
      isBusy: true,
      isPaused: false,
    })
  );
}

async function verifiesCountdownState() {
  await renderNode(
    <VideoActivePage
      recordingState={createRecordingState({
        status: VideoRecordingStatus.COUNTDOWN,
        duration: 0,
        countdownEndsAt: Date.now() + 1_500,
        captureMode: CaptureMode.SCREEN,
      })}
      onPauseResume={() => undefined}
      onStop={() => undefined}
    />
  );

  expect(mocks.displayMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      value: '2',
    })
  );
  expect(mocks.controlsMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      canControl: false,
      isBusy: true,
    })
  );
}

function runVideoActivePageSuite() {
  it('derives busy preparing state for the active video page', verifiesPreparingState);
  it('shows countdown values and pause state when countdown is active', verifiesCountdownState);
}

describe('VideoActivePage', runVideoActivePageSuite);
