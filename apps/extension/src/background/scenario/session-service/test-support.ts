import type {
  PendingScenarioCapture,
  PendingScenarioCaptureInput,
  ScenarioStoredTabState,
} from './types';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';

export function createPendingScenarioCaptureInput(): PendingScenarioCaptureInput {
  return {
    id: 'pending-1',
    dataUrl: 'data:image/png;base64,1',
    filename: 'capture.png',
    galleryAssetId: 'gallery-1',
    captureSurface: 'visible' as const,
    sourceKind: 'manual' as const,
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1440, height: 900 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    target: null,
    interactionPoint: null,
    cursorPoint: null,
    title: 'Step',
    body: '',
  };
}

export function createStoredPendingScenarioCapture() {
  const capture = createPendingScenarioCaptureInput();
  return {
    id: capture.id,
    pendingAssetId: 'pending-asset-1',
    filename: capture.filename,
    galleryAssetId: capture.galleryAssetId,
    captureSurface: capture.captureSurface,
    sourceKind: capture.sourceKind,
    page: capture.page,
    target: capture.target,
    interactionPoint: capture.interactionPoint,
    cursorPoint: capture.cursorPoint,
    title: capture.title,
    body: capture.body,
  } satisfies PendingScenarioCapture;
}

export function createStoredScenarioTabState(args: {
  captureMode: ScenarioSessionState['captureMode'];
  pendingCapture?: ReturnType<typeof createStoredPendingScenarioCapture> | null;
  pendingProjectSelection?: boolean;
  projectId: string | null;
  projectName: string | null;
  rememberProjectSelection?: boolean;
  surface?: ScenarioStoredTabState['surface'];
}): ScenarioStoredTabState {
  return {
    session: {
      enabled: true,
      captureMode: args.captureMode,
      projectId: args.projectId,
      projectName: args.projectName,
      rememberProjectSelection: args.rememberProjectSelection ?? true,
      pendingProjectSelection: args.pendingProjectSelection ?? false,
      sidebarVisible: true,
    },
    surface: args.surface ?? {
      screenshotMode: args.captureMode === 'manual',
      toolbarVisible: args.captureMode === 'manual',
      captureAction: args.captureMode === 'manual' ? 'scenario' : 'download_default',
    },
    pendingCapture: args.pendingCapture ?? null,
  };
}

export function createExpectedPersistedPendingCaptureState(
  pendingCapture = createStoredPendingScenarioCapture()
) {
  return new Map([
    [
      12,
      {
        session: {
          enabled: true,
          captureMode: 'by-click',
          projectId: null,
          projectName: null,
          rememberProjectSelection: true,
          pendingProjectSelection: true,
          sidebarVisible: true,
        },
        surface: {
          screenshotMode: false,
          toolbarVisible: true,
          captureAction: 'scenario' as const,
        },
        pendingCapture,
      },
    ],
  ]);
}
