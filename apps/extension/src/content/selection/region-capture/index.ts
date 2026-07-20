// Region Capture API - viewport capture constrained to page bounds.
// https://github.com/w3c/mediacapture-region-capture

import { REGION_CAPTURE_MARKER_ID } from '@sniptale/ui/branding';
import { createLazyContentDefaultOwner } from '../../application/default-owner';
import {
  applyVideoTrackHints,
  applyViewportCrop,
  configureRegionCaptureRecorder,
  createViewportCropTarget,
  getRegionCaptureDisplayStream,
  resolveRegionCaptureStream,
} from './helpers';
import {
  createRegionCaptureSession as createRegionCaptureSessionInstance,
  type RegionCaptureSession,
  type RegionCaptureSessionDeps,
} from './session';
import { saveRegionCaptureRecording } from './recording';
import type { CaptureProgress, RegionCaptureSettings } from './types';

function getViewportMarker(): HTMLElement {
  const id = REGION_CAPTURE_MARKER_ID;
  let marker = document.getElementById(id);

  if (!marker) {
    marker = document.createElement('div');
    marker.id = id;
    marker.style.position = 'fixed';
    marker.style.top = '0';
    marker.style.left = '0';
    marker.style.width = '100vw';
    marker.style.height = '100vh';
    marker.style.pointerEvents = 'none';
    marker.style.zIndex = '-2147483648';
    marker.style.visibility = 'visible';

    // why: Region Capture targets the real page viewport; keeping this marker in light DOM
    // avoids crop-target issues with shadow-owned elements.
    (document.body || document.documentElement).appendChild(marker);
  }

  return marker;
}

type RegionCaptureMediaDevices = MediaDevices & {
  produceCropTarget?: unknown;
};

function removeViewportMarker(): void {
  document.getElementById(REGION_CAPTURE_MARKER_ID)?.remove();
}

/**
 * Creates a region-capture session with private recording state and explicit cleanup.
 */
export function createRegionCaptureSession(
  deps: RegionCaptureSessionDeps = {}
): RegionCaptureSession {
  return createRegionCaptureSessionInstance({
    applyTrackHints: deps.applyTrackHints ?? applyVideoTrackHints,
    applyViewportCrop: deps.applyViewportCrop ?? applyViewportCrop,
    configureRecorder: deps.configureRecorder ?? configureRegionCaptureRecorder,
    createCropTarget: deps.createCropTarget ?? createViewportCropTarget(getViewportMarker),
    getDisplayStream: deps.getDisplayStream ?? getRegionCaptureDisplayStream,
    removeMarker: deps.removeMarker ?? removeViewportMarker,
    resolveCaptureStream: deps.resolveCaptureStream ?? resolveRegionCaptureStream,
    saveRecording: deps.saveRecording ?? saveRegionCaptureRecording,
    scheduleTimeout: deps.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis),
  });
}

const defaultRegionCaptureSession = createLazyContentDefaultOwner(createRegionCaptureSession);

export async function startRegionCapture(
  settings: RegionCaptureSettings,
  onProgress: (progress: CaptureProgress) => void
): Promise<void> {
  await defaultRegionCaptureSession.getOwner().start(settings, onProgress);
}

export function stopRegionCapture(): void {
  defaultRegionCaptureSession.getOwnerIfCreated()?.stop();
}

function isRegionCaptureSupported(): boolean {
  return (
    'produceCropTarget' in (navigator.mediaDevices as RegionCaptureMediaDevices) &&
    'cropTo' in MediaStreamTrack.prototype
  );
}

export function getRegionCaptureSupport(): {
  supported: boolean;
  produceCropTarget: boolean;
  cropTo: boolean;
} {
  return {
    supported: isRegionCaptureSupported(),
    produceCropTarget: 'produceCropTarget' in (navigator.mediaDevices as RegionCaptureMediaDevices),
    cropTo: 'cropTo' in MediaStreamTrack.prototype,
  };
}
