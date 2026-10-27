import { optimizeScreenshotDataUrl } from '../../../platform/media-utils/screenshot-encoding';
import { createScreenshotFilename as generateFilename } from '../../../workflows/file-naming/index';
import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import type { CaptureActionType, Settings } from '../../../contracts/settings';
import { loadSettings } from '../../../composition/persistence/settings';
import { saveScreenshotToMediaHubFromDataUrl } from '../../media-hub/assets';
import type { ScenarioSessionService } from '../../scenario/session-service/index';
import { persistScenarioCaptureFromBackground } from './scenario-capture-persistence';
import { transitionCaptureJob } from '../jobs/state-machine';
import { readCaptureDeliveryPayload, type CaptureDeliveryPayload } from './payload';
import type {
  CaptureModeLabel,
  CaptureImagePreparation,
  CapturePersistenceSettings,
  PreparedCaptureAction,
  StartCapturePorts,
} from './ports';

const defaultStartCapturePorts: StartCapturePorts = {
  generateFilename,
  loadSettings,
  persistScenarioCaptureFromBackground,
  saveScreenshotToMediaHubFromDataUrl,
  transitionCaptureJob,
};

export function createVisibleCapturePromise(
  captureVisibleTabForCrop: (tabId: number) => Promise<CaptureDeliveryPayload>,
  resolvedTabId: number
): Promise<CaptureDeliveryPayload> {
  return captureVisibleTabForCrop(resolvedTabId);
}

export async function runStartCaptureUseCase(
  args: {
    actionType?: CaptureActionType | undefined;
    imageFormat?: Settings['imageFormat'] | undefined;
    capture: () => Promise<CaptureDeliveryPayload>;
    captureTarget: CaptureModeLabel;
    prepareImage?: CaptureImagePreparation | undefined;
    assertCurrent?: (() => void) | undefined;
    resolvedTabId: number;
    scenarioCapture: ScenarioRuntimeCapturePayload | undefined;
    scenarioSessionService: ScenarioSessionService;
  },
  ports: StartCapturePorts = defaultStartCapturePorts
): Promise<PreparedCaptureAction & { payload: CaptureDeliveryPayload }> {
  const settings = await ports.loadSettings();
  args.assertCurrent?.();
  const captureAction = args.actionType ?? settings.captureAction;
  let filename = await ports.generateFilename(
    args.captureTarget,
    args.imageFormat ?? settings.imageFormat,
    settings
  );
  args.assertCurrent?.();
  const capturePromise = args.capture().then(async (payload) => {
    const { dataUrl, jobId } = readCaptureDeliveryPayload(payload);
    try {
      const prepared = args.prepareImage
        ? await args.prepareImage(dataUrl, filename)
        : { dataUrl, filename };
      if (!args.prepareImage && args.captureTarget !== 'full') {
        prepared.dataUrl = await optimizeScreenshotDataUrl(prepared.dataUrl);
      }
      args.assertCurrent?.();
      filename = prepared.filename;
      return jobId ? { dataUrl: prepared.dataUrl, jobId } : prepared.dataUrl;
    } catch (error) {
      if (jobId)
        await ports
          .transitionCaptureJob(jobId, 'failed', {
            error: error instanceof Error ? error.message : 'Screenshot preparation failed',
          })
          .catch(() => undefined);
      throw error;
    }
  });
  const preparedPayload = await capturePromise;
  const payload = await createCaptureDeliveryPromise(Promise.resolve(preparedPayload), {
    captureAction,
    filename,
    ports,
    assertCurrent: args.assertCurrent,
    resolvedTabId: args.resolvedTabId,
    scenarioCapture: args.scenarioCapture,
    scenarioSessionService: args.scenarioSessionService,
    settings,
  });

  return {
    captureAction,
    defaultImagePresetId: settings.defaultImagePresetId,
    filename,
    payload,
  };
}

export async function maybePersistScreenshotInMediaHub(
  settings: Pick<Settings, 'localStoragePolicy'>,
  dataUrl: string,
  filename: string,
  tabId: number,
  captureAction: CaptureActionType = 'download_default',
  ports: Pick<StartCapturePorts, 'saveScreenshotToMediaHubFromDataUrl'> = defaultStartCapturePorts
): Promise<string | null> {
  const storageClass =
    captureAction === 'save_to_library'
      ? 'library'
      : (settings.localStoragePolicy?.defaultDestination ?? 'temporary');
  return ports.saveScreenshotToMediaHubFromDataUrl(dataUrl, filename, tabId, storageClass);
}

export function resolveScenarioCaptureForAction(args: {
  captureAction: CaptureActionType | string | undefined;
  scenarioCapture: ScenarioRuntimeCapturePayload | undefined;
}): ScenarioRuntimeCapturePayload | undefined {
  return args.captureAction === 'scenario' ? args.scenarioCapture : undefined;
}

export function createCaptureDeliveryPromise(
  capturePromise: Promise<CaptureDeliveryPayload>,
  args: {
    captureAction: CaptureActionType;
    assertCurrent?: (() => void) | undefined;
    filename: string;
    ports?: Pick<
      StartCapturePorts,
      | 'persistScenarioCaptureFromBackground'
      | 'saveScreenshotToMediaHubFromDataUrl'
      | 'transitionCaptureJob'
    >;
    resolvedTabId: number;
    scenarioCapture: ScenarioRuntimeCapturePayload | undefined;
    scenarioSessionService: ScenarioSessionService;
    settings: CapturePersistenceSettings;
  }
): Promise<CaptureDeliveryPayload> {
  const ports = args.ports ?? defaultStartCapturePorts;
  return capturePromise.then(async (payload) => {
    const { dataUrl, jobId } = readCaptureDeliveryPayload(payload);
    const assetId = await persistCaptureDeliveryPayload({ ...args, dataUrl, jobId, ports });
    if (assetId && args.captureAction === 'edit') {
      return { assetId, dataUrl, ...(jobId ? { jobId } : {}) };
    }
    return jobId ? { dataUrl, jobId } : dataUrl;
  });
}

async function persistCaptureDeliveryPayload(args: {
  dataUrl: string;
  filename: string;
  assertCurrent?: (() => void) | undefined;
  jobId?: string | undefined;
  ports: Pick<
    StartCapturePorts,
    | 'persistScenarioCaptureFromBackground'
    | 'saveScreenshotToMediaHubFromDataUrl'
    | 'transitionCaptureJob'
  >;
  resolvedTabId: number;
  captureAction: CaptureActionType;
  scenarioCapture: ScenarioRuntimeCapturePayload | undefined;
  scenarioSessionService: ScenarioSessionService;
  settings: Pick<Settings, 'defaultImagePresetId' | 'localStoragePolicy'>;
}): Promise<string | null> {
  try {
    args.assertCurrent?.();
    const galleryAssetId = await maybePersistScreenshotInMediaHub(
      args.settings,
      args.dataUrl,
      args.filename,
      args.resolvedTabId,
      args.captureAction,
      args.ports
    );
    args.assertCurrent?.();
    const scenarioCapture = resolveScenarioCaptureForAction({
      captureAction: args.captureAction,
      scenarioCapture: args.scenarioCapture,
    });

    await args.ports.persistScenarioCaptureFromBackground({
      dataUrl: args.dataUrl,
      galleryAssetId,
      ...(scenarioCapture === undefined ? {} : { scenarioCapture }),
      tabId: args.resolvedTabId,
      scenarioSessionService: args.scenarioSessionService,
    });
    args.assertCurrent?.();
    return galleryAssetId;
  } catch (error) {
    if (args.jobId) {
      await args.ports
        .transitionCaptureJob(args.jobId, 'failed', {
          error: error instanceof Error ? error.message : 'Capture persistence failed',
        })
        .catch(() => undefined);
    }
    throw error;
  }
}
