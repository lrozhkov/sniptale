// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { REGION_CAPTURE_MARKER_ID } from '@sniptale/ui/branding';

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
  createViewportCropTarget: vi.fn((getMarker: () => HTMLElement) => async () => ({
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

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

it('wires default region-capture deps and manages the viewport marker', async () => {
  const session = createRegionCaptureSession() as any;
  const cropTarget = await session.createCropTarget();

  expect(cropTarget.marker.id).toBe(REGION_CAPTURE_MARKER_ID);
  expect(document.getElementById(REGION_CAPTURE_MARKER_ID)).not.toBeNull();

  session.removeMarker();
  expect(document.getElementById(REGION_CAPTURE_MARKER_ID)).toBeNull();
  expect(typeof session.scheduleTimeout).toBe('function');
});

it('starts and stops the default owner session', async () => {
  await startRegionCapture({ audio: false } as never, vi.fn());
  stopRegionCapture();

  expect(mocks.startMock).toHaveBeenCalled();
  expect(mocks.stopMock).toHaveBeenCalledOnce();
});

it('reports unsupported region-capture environments', () => {
  const originalMediaDevices = navigator.mediaDevices;

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {},
  });
  vi.stubGlobal('MediaStreamTrack', class {} as any);

  expect(getRegionCaptureSupport()).toEqual({
    cropTo: false,
    produceCropTarget: false,
    supported: false,
  });

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: originalMediaDevices,
  });
  vi.unstubAllGlobals();
});
