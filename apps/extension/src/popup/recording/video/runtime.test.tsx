// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { beforeEach, expect, it, vi } from 'vitest';
import { getTabCapabilities } from '../../../features/tab-capabilities/capabilities';

const mocks = vi.hoisted(() => ({
  mediaEffects: vi.fn(),
  persistenceEffects: vi.fn(),
  refreshGalleryStatus: vi.fn(),
}));

vi.mock('../../shell/runtime/actions', () => ({
  usePopupRuntimeActions: () => ({
    refreshActiveTabCapabilities: vi.fn(),
    refreshGalleryStatus: mocks.refreshGalleryStatus,
    refreshMicrophones: vi.fn(),
    refreshWebcams: vi.fn(),
  }),
}));
vi.mock('../../shell/runtime/media-device-effects', () => ({
  usePopupMediaDeviceEffects: mocks.mediaEffects,
}));
vi.mock('../../shell/runtime/video-persistence-effects', () => ({
  usePopupVideoPersistenceEffects: mocks.persistenceEffects,
}));

beforeEach(() => vi.clearAllMocks());

it('owns only Video state and starts device work after route bootstrap', async () => {
  const { useVideoRouteRuntime } = await import('./runtime');
  let latest!: ReturnType<typeof useVideoRouteRuntime>;
  function Harness() {
    latest = useVideoRouteRuntime({
      capabilities: getTabCapabilities(null),
      initialMode: CaptureMode.CAMERA,
    });
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Harness />));

  expect(latest).not.toHaveProperty('session');
  expect(latest.presets.videoCaptureMode).toBe(CaptureMode.CAMERA);
  expect(mocks.mediaEffects).toHaveBeenLastCalledWith(expect.objectContaining({ page: 'home' }));

  act(() => latest.setIsReady(true));
  expect(mocks.mediaEffects).toHaveBeenLastCalledWith(expect.objectContaining({ page: 'video' }));
  expect(mocks.refreshGalleryStatus).toHaveBeenCalledOnce();
  act(() => root.unmount());
});
