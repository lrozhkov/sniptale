// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useToggleWebcamHandler } from './webcam';

const { toggleWebcamMock } = vi.hoisted(() => ({
  toggleWebcamMock: vi.fn(),
}));

vi.mock('../../recording/webcam-flow', (_importOriginal) => ({
  toggleWebcam: toggleWebcamMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestHandler: (() => void) | null = null;

function HookHarness({ state }: { state: Parameters<typeof useToggleWebcamHandler>[0] }) {
  latestHandler = useToggleWebcamHandler(state);
  return null;
}

async function renderHarness(state: Parameters<typeof useToggleWebcamHandler>[0]): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<HookHarness state={state} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestHandler = null;
  toggleWebcamMock.mockReset();
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

describe('useToggleWebcamHandler', () => {
  it('delegates webcam toggles through the popup webcam flow', async () => {
    const state = {
      actions: {
        refreshWebcams: vi.fn(async () => []),
      },
      recording: {
        setStartError: vi.fn(),
        setVideoSettings: vi.fn(),
        videoSettings: { webcamDeviceId: 'cam-1', webcamEnabled: false },
      },
    } as unknown as Parameters<typeof useToggleWebcamHandler>[0];

    await renderHarness(state);
    act(() => {
      latestHandler?.();
    });

    expect(toggleWebcamMock).toHaveBeenCalledWith({
      refreshWebcams: state.actions.refreshWebcams,
      setStartError: state.recording.setStartError,
      setVideoSettings: state.recording.setVideoSettings,
      videoSettings: state.recording.videoSettings,
    });
  });
});
