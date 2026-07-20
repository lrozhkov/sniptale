// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createLazyOwnerMock: vi.fn(() => ({
    getOwner: () => ({ start: mocks.startMock }),
    getOwnerIfCreated: () => ({ stop: mocks.stopMock }),
  })),
  sessionFactoryMock: vi.fn((deps) => deps),
  startMock: vi.fn(),
  stopMock: vi.fn(),
}));

vi.mock('../../application/default-owner', () => ({
  createLazyContentDefaultOwner: mocks.createLazyOwnerMock,
}));

vi.mock('./session', async (importOriginal) => ({
  ...(await importOriginal()),
  createRegionCaptureSession: mocks.sessionFactoryMock,
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal()),
  applyVideoTrackHints: vi.fn(),
  applyViewportCrop: vi.fn(),
  configureRegionCaptureRecorder: vi.fn(),
  createViewportCropTarget: vi.fn((getMarker: () => HTMLElement) => () => ({
    marker: getMarker(),
  })),
  getRegionCaptureDisplayStream: vi.fn(),
  resolveRegionCaptureStream: vi.fn(),
}));

vi.mock('./recording', async (importOriginal) => ({
  ...(await importOriginal()),
  saveRegionCaptureRecording: vi.fn(),
}));

import {
  createRegionCaptureSession,
  getRegionCaptureSupport,
  startRegionCapture,
  stopRegionCapture,
} from '.';

function stubRegionCaptureSupport() {
  class MediaStreamTrackMock {}
  (MediaStreamTrackMock.prototype as any).cropTo = vi.fn();

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { produceCropTarget: vi.fn() },
  });
  vi.stubGlobal('MediaStreamTrack', MediaStreamTrackMock as any);
}

describe('region capture facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates region capture sessions and starts/stops the default owner', async () => {
    const session = createRegionCaptureSession() as any;

    expect(mocks.sessionFactoryMock).toHaveBeenCalledOnce();
    expect(session.removeMarker).toBeInstanceOf(Function);

    await startRegionCapture({ audio: false } as never, vi.fn());
    stopRegionCapture();

    expect(mocks.startMock).toHaveBeenCalled();
    expect(mocks.stopMock).toHaveBeenCalledOnce();
  });

  it('reports region capture support flags', () => {
    const originalMediaDevices = navigator.mediaDevices;
    stubRegionCaptureSupport();

    expect(getRegionCaptureSupport()).toEqual({
      cropTo: true,
      produceCropTarget: true,
      supported: true,
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
    vi.unstubAllGlobals();
  });
});
