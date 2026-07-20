import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { PendingScenarioCapture, ScenarioStoredTabState } from './contracts';

export function createStoredPendingScenarioCapture(): PendingScenarioCapture {
  return {
    id: 'pending-1',
    pendingAssetId: 'pending-asset-1',
    filename: 'capture.png',
    galleryAssetId: 'gallery-1',
    captureSurface: 'visible',
    sourceKind: 'manual',
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

export function createStoredScenarioTabState(args: {
  captureMode: ScenarioSessionState['captureMode'];
  pendingCapture?: PendingScenarioCapture | null;
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
