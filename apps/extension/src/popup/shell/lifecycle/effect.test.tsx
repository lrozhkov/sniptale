// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { usePopupLifecycleEffect } from './effect';

const { setupPopupLifecycleMock } = vi.hoisted(() => ({
  setupPopupLifecycleMock: vi.fn(),
}));

vi.mock('./index', (_importOriginal) => ({
  setupPopupLifecycle: setupPopupLifecycleMock,
}));

function createLifecycleParams() {
  return {
    clearAppliedViewportAuthority: vi.fn(),
    refreshActiveTabCapabilities: vi.fn(async () => undefined),
    refreshGalleryStatus: vi.fn(async () => undefined),
    setHomeError: vi.fn(),
    setViewportPresets: vi.fn(),
    setQuickActions: vi.fn(),
    setQuickActionsReady: vi.fn(),
    setDisplayMode: vi.fn(),
    setVideoSettings: vi.fn(),
    setSelectedPresetId: vi.fn(),
    setVideoCaptureMode: vi.fn(),
    setRecordingState: vi.fn(),
    setMicrophoneDevices: vi.fn(),
    setWebcamDevices: vi.fn(),
    setGalleryStatus: vi.fn(),
    setIsReady: vi.fn(),
    setStartError: vi.fn(),
    setIsStartPending: vi.fn(),
    setRecordingControlCapability: vi.fn(),
  };
}

function LifecycleHarness({ version }: { version: number }) {
  usePopupLifecycleEffect(() => createLifecycleParams());
  return <div data-version={version} />;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  setupPopupLifecycleMock.mockReset();
});

it('subscribes once and cleans up on unmount despite rerenders', () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const cleanup = vi.fn();
  setupPopupLifecycleMock.mockReturnValue(cleanup);

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(<LifecycleHarness version={1} />);
  });

  act(() => {
    root!.render(<LifecycleHarness version={2} />);
  });

  expect(setupPopupLifecycleMock).toHaveBeenCalledTimes(1);

  act(() => {
    root!.unmount();
  });

  expect(cleanup).toHaveBeenCalledTimes(1);
});
