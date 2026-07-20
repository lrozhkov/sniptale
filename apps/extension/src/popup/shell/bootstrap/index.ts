import type {
  QuickAction,
  QuickActionsDisplayMode,
  ViewportPreset,
} from '../../../contracts/settings';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  type VideoRecordingRuntimeState,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingStateResponse } from '../../../contracts/messaging/contracts/response-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { type MicrophoneOption } from '../../recording/microphone';
import { type WebcamOption } from '../../recording/webcam';
import { startPopupPerfSpan, trackPopupPerfAsync } from '../../diagnostics/performance';
import { popupBootstrapTransport, type RuntimeMessagingTransport } from './runtime';
import { createPopupHomeBootstrapPromises, loadPopupHomeBootstrapData } from './home';
import {
  loadRecordingStateResponseWithFallback,
  resolvePopupBootstrapRecordingState,
} from './recording-state';
import { createPopupVideoBootstrapPromises, loadPopupBootstrapVideoData } from './video';

const logger = createLogger({ namespace: 'PopupBootstrap' });

export type PopupBootstrapResult = {
  viewportPresets: ViewportPreset[];
  quickActions: QuickAction[];
  quickActionsMode: QuickActionsDisplayMode;
  videoSettings: VideoRecordingSettings;
  recordingControlCapability: { controlToken: string; recordingId: string } | null;
  recordingState: VideoRecordingRuntimeState;
  homeError?: string | null;
  recordingStatusError?: string | null;
  microphones: MicrophoneOption[];
  webcams: WebcamOption[];
  selectedPresetId: string | null;
  captureMode: CaptureMode;
};

type PopupBootstrapData = {
  actions: QuickAction[];
  homeError: string | null;
  microphones: MicrophoneOption[];
  webcams: WebcamOption[];
  quickActionsMode: QuickActionsDisplayMode;
  recordingResponse: RecordingStateResponse;
  selectedPresetId: string | null;
  captureMode: CaptureMode;
  videoSettings: VideoRecordingSettings;
  viewportPresets: ViewportPreset[];
};

type PopupBootstrapPromises = {
  recordingResponsePromise: Promise<RecordingStateResponse>;
};

export async function bootstrapPopupState(): Promise<PopupBootstrapResult> {
  return bootstrapPopupStateWithTransport(popupBootstrapTransport);
}

export async function bootstrapPopupStateWithTransport(
  transport: RuntimeMessagingTransport
): Promise<PopupBootstrapResult> {
  const bootstrapSpan = startPopupPerfSpan('popup.bootstrap.total');

  try {
    const bootstrapData = await loadPopupBootstrapData(transport);
    const result = buildPopupBootstrapResult(bootstrapData);

    bootstrapSpan?.end({
      microphoneCount: result.microphones.length,
      quickActionCount: result.quickActions.length,
      viewportPresetCount: result.viewportPresets.length,
    });

    return result;
  } catch (error) {
    bootstrapSpan?.fail(error);
    throw error;
  }
}

function createPopupBootstrapPromises(
  transport: RuntimeMessagingTransport
): PopupBootstrapPromises {
  return {
    recordingResponsePromise: trackPopupPerfAsync('popup.bootstrap.recording-state', () =>
      loadRecordingStateResponseWithFallback(transport, (error) => {
        logger.error('Failed to bootstrap recording state', error);
      })
    ),
  };
}

async function loadPopupBootstrapData(
  transport: RuntimeMessagingTransport
): Promise<PopupBootstrapData> {
  const bootstrapDataSpan = startPopupPerfSpan('popup.bootstrap.data');
  const { recordingResponsePromise } = createPopupBootstrapPromises(transport);
  const homeDataPromise = loadPopupHomeBootstrapData(createPopupHomeBootstrapPromises());
  const videoDataPromise = loadPopupBootstrapVideoData(createPopupVideoBootstrapPromises());

  const [homeData, videoData, recordingResponse] = await Promise.all([
    homeDataPromise,
    videoDataPromise,
    recordingResponsePromise,
  ]);

  bootstrapDataSpan?.end();

  return {
    captureMode: videoData.captureMode,
    homeError: homeData.homeError,
    actions: homeData.actions,
    microphones: videoData.microphones,
    webcams: videoData.webcams,
    quickActionsMode: homeData.quickActionsMode,
    recordingResponse,
    selectedPresetId: videoData.selectedPresetId,
    videoSettings: videoData.videoSettings,
    viewportPresets: videoData.viewportPresets,
  };
}
function buildPopupBootstrapResult(data: PopupBootstrapData): PopupBootstrapResult {
  const { recordingState, recordingStatusError } = resolvePopupBootstrapRecordingState(
    data.recordingResponse
  );

  return {
    captureMode: data.captureMode,
    homeError: data.homeError,
    microphones: data.microphones,
    webcams: data.webcams,
    quickActions: data.actions.filter((action) => action.status),
    quickActionsMode: data.quickActionsMode,
    recordingControlCapability:
      typeof data.recordingResponse.controlToken === 'string' &&
      typeof data.recordingResponse.recordingId === 'string'
        ? {
            controlToken: data.recordingResponse.controlToken,
            recordingId: data.recordingResponse.recordingId,
          }
        : null,
    recordingState,
    recordingStatusError,
    selectedPresetId: data.selectedPresetId,
    videoSettings: data.videoSettings,
    viewportPresets: data.viewportPresets,
  };
}
