import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import type { Settings } from '../../../contracts/settings';
import type { CaptureActionType } from '../../../contracts/settings';
import type { ScenarioSessionService } from '../../scenario/session-service/index';
import type { CaptureJobRecord } from '../jobs/state-machine';

export type CaptureModeLabel = 'visible' | 'full';

export type CapturePersistenceSettings = Pick<
  Settings,
  'defaultImagePresetId' | 'saveCapturesToGallery'
>;

export type StartCapturePorts = {
  generateFilename(mode: CaptureModeLabel, imageFormat: Settings['imageFormat']): string;
  loadSettings(): Promise<Settings>;
  persistScenarioCaptureFromBackground(args: {
    dataUrl: string;
    galleryAssetId: string | null;
    scenarioCapture?: ScenarioRuntimeCapturePayload | undefined;
    scenarioSessionService: ScenarioSessionService;
    tabId: number;
  }): Promise<void>;
  saveScreenshotToMediaHubFromDataUrl(
    dataUrl: string,
    filename: string,
    tabId: number
  ): Promise<string | null>;
  transitionCaptureJob(
    jobId: string,
    state: 'completed' | 'failed',
    updates?: { error?: string }
  ): Promise<unknown>;
};

export type CompleteCapturePorts = {
  transitionCaptureJob(
    jobId: string,
    state: 'completed' | 'failed',
    updates?: { error?: string }
  ): Promise<unknown>;
};

export type DownloadCapturePorts = {
  downloadImageInServiceWorker(
    dataUrl: string,
    filename: string,
    captureJobId?: string | undefined
  ): Promise<void>;
  generateFilename(mode: CaptureModeLabel, imageFormat: Settings['imageFormat']): string;
  loadSettings(): Promise<Settings>;
};

export type ReconcileCaptureJobsOptions = {
  cleanupInterruptedCapture(tabId: number): Promise<void>;
  nowEpochMs?: number;
  reconcileExportingDownload(
    job: CaptureJobRecord
  ): Promise<'completed' | 'failed' | 'missing' | 'pending' | 'rebound'>;
};

export type ReconcileCaptureJobsSummary = {
  activeFailed: number;
  downloadsReconciled: number;
  staleRemoved: number;
};

export type ReconcileCaptureJobsPort = (
  options: ReconcileCaptureJobsOptions
) => Promise<ReconcileCaptureJobsSummary>;

export type PreparedCaptureAction = {
  captureAction: CaptureActionType;
  defaultImagePresetId?: string | null | undefined;
  filename: string;
};
