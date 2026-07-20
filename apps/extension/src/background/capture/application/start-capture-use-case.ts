import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import type { CaptureActionType, Settings } from '../../../contracts/settings';
import { loadSettings } from '../../../composition/persistence/settings';
import { generateFilename } from '@sniptale/foundation/utils/filename';
import { saveScreenshotToMediaHubFromDataUrl } from '../../media-hub/assets';
import type { ScenarioSessionService } from '../../scenario/session-service/index';
import { persistScenarioCaptureFromBackground } from './scenario-capture-persistence';
import { transitionCaptureJob } from '../jobs/state-machine';
import { readCaptureDeliveryPayload, type CaptureDeliveryPayload } from './payload';
import type {
  CaptureModeLabel,
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
  captureViewportWithClip: (
    tabId: number,
    viewport: { width: number; height: number }
  ) => Promise<CaptureDeliveryPayload>,
  captureVisibleTabForCrop: (tabId: number) => Promise<CaptureDeliveryPayload>,
  resolvedTabId: number,
  viewportState: Map<number, { width: number; height: number } | null>
): Promise<CaptureDeliveryPayload> {
  const viewport = viewportState.get(resolvedTabId);
  const useViewportCapture = viewport !== null && viewport !== undefined;
  return useViewportCapture
    ? captureViewportWithClip(resolvedTabId, viewport)
    : captureVisibleTabForCrop(resolvedTabId);
}

export async function runStartCaptureUseCase(
  args: {
    actionType?: CaptureActionType | undefined;
    capture: () => Promise<CaptureDeliveryPayload>;
    captureTarget: CaptureModeLabel;
    resolvedTabId: number;
    scenarioCapture: ScenarioRuntimeCapturePayload | undefined;
    scenarioSessionService: ScenarioSessionService;
  },
  ports: StartCapturePorts = defaultStartCapturePorts
): Promise<PreparedCaptureAction & { payload: CaptureDeliveryPayload }> {
  const settings = await ports.loadSettings();
  const captureAction = args.actionType ?? settings.captureAction;
  const filename = ports.generateFilename(args.captureTarget, settings.imageFormat);
  const payload = await createCaptureDeliveryPromise(args.capture(), {
    captureAction,
    filename,
    ports,
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
  settings: { saveCapturesToGallery?: boolean },
  dataUrl: string,
  filename: string,
  tabId: number,
  ports: Pick<StartCapturePorts, 'saveScreenshotToMediaHubFromDataUrl'> = defaultStartCapturePorts
): Promise<string | null> {
  if (!settings.saveCapturesToGallery) {
    return null;
  }

  return ports.saveScreenshotToMediaHubFromDataUrl(dataUrl, filename, tabId);
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
    await persistCaptureDeliveryPayload({ ...args, dataUrl, jobId, ports });
    return jobId === undefined ? dataUrl : { dataUrl, jobId };
  });
}

async function persistCaptureDeliveryPayload(args: {
  dataUrl: string;
  filename: string;
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
  settings: Pick<Settings, 'defaultImagePresetId' | 'saveCapturesToGallery'>;
}): Promise<void> {
  try {
    const galleryAssetId = await maybePersistScreenshotInMediaHub(
      args.settings,
      args.dataUrl,
      args.filename,
      args.resolvedTabId,
      args.ports
    );
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
