// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lazyMock: vi.fn(),
  routeResolved: true,
}));

vi.mock('../../lazy-chunks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lazy-chunks')>()),
  getResolvedVideoSetupPage: () =>
    mocks.routeResolved
      ? (props: unknown) => {
          mocks.lazyMock(props);
          return <div data-testid="video-setup-page" />;
        }
      : null,
}));

import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import { createPopupAppShellRuntime } from '../test-support/runtime';
import { PopupVideoSetup } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createRuntime(): PopupVideoSetupRuntime {
  return createPopupAppShellRuntime({
    videoCaptureMode: CaptureMode.TAB,
    viewportPresets: [
      {
        kind: 'user',
        id: 'preset-1',
        name: 'Preset',
        target: 'window',
        width: 1280,
        height: 720,
        enabled: true,
        order: 0,
      },
    ],
  });
}

async function renderPopupVideoSetup(runtime = createRuntime()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PopupVideoSetup runtime={runtime} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  mocks.lazyMock.mockReset();
  mocks.routeResolved = true;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('passes derived props to the lazy video setup page', async () => {
  const runtime = createRuntime();

  await renderPopupVideoSetup(runtime);

  expect(container?.querySelector('[data-testid="video-setup-page"]')).toBeTruthy();
  expect(mocks.lazyMock).toHaveBeenCalledTimes(1);
  expect(mocks.lazyMock).toHaveBeenCalledWith(
    expect.objectContaining({
      captureMode: runtime.recording.videoCaptureMode,
      onCancel: expect.any(Function),
      onPauseResume: runtime.recording.handlePauseResume,
      settings: runtime.recording.videoSettings,
      selectedPresetId: runtime.recording.selectedPresetId,
      onStart: runtime.recording.handleStartRecording,
      onStop: runtime.recording.handleStop,
    })
  );
});

it('shows an immediate guard fallback if a video route is committed before resolution', async () => {
  mocks.routeResolved = false;

  await renderPopupVideoSetup();

  expect(container?.querySelector('[data-ui="popup.app.route-loading"]')).not.toBeNull();
  expect(mocks.lazyMock).not.toHaveBeenCalled();
});
