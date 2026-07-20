import type { ScenarioRuntimeCapturePayload } from '../../../../contracts/messaging/contracts/types';
import type { ScenarioCaptureMetadata } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';

export function createCaptureMetadata(): ScenarioCaptureMetadata {
  return {
    pointerRange: {
      start: { x: 40, y: 54 },
      end: { x: 44, y: 58 },
      minX: 40,
      minY: 54,
      maxX: 44,
      maxY: 58,
      distance: 6,
      durationMs: 180,
    },
    scroll: {
      startX: 10,
      startY: 20,
      endX: 10,
      endY: 80,
      deltaX: 0,
      deltaY: 60,
    },
    trigger: 'pointer-up',
  };
}

export function createScenarioCapturePayload(): ScenarioRuntimeCapturePayload {
  return {
    captureSurface: 'visible',
    sourceKind: 'auto-click',
    page: {
      title: 'Example',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      scrollX: 10,
      scrollY: 20,
      devicePixelRatio: 1,
    },
    target: {
      selector: '#submit',
      iframeSelector: null,
      tagName: 'button',
      role: 'button',
      text: 'Submit',
      ariaLabel: null,
      title: null,
      rect: { x: 40, y: 50, width: 120, height: 32 },
      framePadding: { top: 0, left: 0, right: 0, bottom: 0 },
    },
    interactionPoint: { x: 44, y: 58 },
    cursorPoint: { x: 45, y: 59 },
    captureMetadata: createCaptureMetadata(),
    title: 'Click submit',
    body: 'Starts the export flow.',
  };
}

export function createMinimalScenarioCapturePayload(): ScenarioRuntimeCapturePayload {
  return {
    captureSurface: 'full',
    sourceKind: 'manual',
    page: {
      title: null,
      url: null,
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  };
}

export function createSessionState(
  overrides: Partial<ScenarioSessionState> = {}
): ScenarioSessionState {
  return {
    enabled: false,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: true,
    ...overrides,
  };
}

export function createPendingCapture(id: string) {
  return {
    id,
    pendingAssetId: `asset-${id}`,
    filename: `${id}.png`,
    galleryAssetId: null,
    captureSurface: 'visible' as const,
    sourceKind: 'manual' as const,
    page: createScenarioCapturePayload().page,
    target: null,
    interactionPoint: null,
    cursorPoint: null,
    title: '',
    body: '',
  };
}
