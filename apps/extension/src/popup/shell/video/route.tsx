import '@sniptale/ui/styles';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import { useEffect, useRef } from 'react';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../platform/i18n/popup';
import type { PopupRecordingSnapshot, PopupStartupDescriptor } from '../startup/descriptor';
import { createPopupVideoBootstrapPromises, loadPopupBootstrapVideoData } from '../bootstrap/video';
import { popupBootstrapTransport } from '../bootstrap/runtime';
import {
  loadRecordingStateResponseWithFallback,
  resolvePopupBootstrapRecordingState,
} from '../bootstrap/recording-state';
import { usePopupRuntimeHandlers } from '../runtime/handlers';
import { assemblePopupVideoRuntimeState } from '../runtime/assembly';
import type { PopupVideoRuntimeStateSlice } from '../runtime/types/internal-state';
import { usePopupPageAccessRuntime, type PopupPageAccessRuntime } from '../runtime/page-access';
import { PageAccessControls } from '../page-access/controls';
import { useActiveTabCapabilities } from '../tab-access/capabilities';
import { getPopupVideoSetupProps } from '../app-shell/video-setup/props';
import VideoSetupPage from '../../recording/video/setup';
import type { VideoSetupPageProps } from '../../recording/video/setup/types';
import { useVideoRouteRuntime } from './runtime';

export function VideoRoute({ startup }: { startup: PopupStartupDescriptor }) {
  const initialStartup = useRef(startup).current;
  const capabilities = useActiveTabCapabilities();
  const state = useVideoRouteRuntime({
    capabilities,
    ...(initialStartup.page === 'video' && initialStartup.videoMode
      ? { initialMode: initialStartup.videoMode }
      : {}),
  });
  const handlers = usePopupRuntimeHandlers(state);
  const pageAccess = usePopupPageAccessRuntime(capabilities);
  const runtime = assemblePopupVideoRuntimeState(state, handlers, pageAccess);
  useVideoRouteBootstrap(initialStartup, capabilities, state);
  useVideoRecordingReconciliation(startup, state.recording);

  const postRecordProps =
    initialStartup.page === 'video' && initialStartup.postRecordSnapshot
      ? {
          initialPostRecordResult: initialStartup.postRecordSnapshot.result,
          initialPostRecordVerified: true,
        }
      : {};

  return (
    <VideoRouteView
      captureMode={state.presets.videoCaptureMode}
      pageAccess={pageAccess}
      postRecordProps={postRecordProps}
      runtime={runtime}
    />
  );
}

function useVideoRouteBootstrap(
  initialStartup: PopupStartupDescriptor,
  capabilities: ReturnType<typeof useActiveTabCapabilities>,
  state: ReturnType<typeof useVideoRouteRuntime>
): void {
  const { setRecordingControlCapability, setRecordingState, setStartError, setVideoSettings } =
    state.recording;
  const { setSelectedPresetId, setVideoCaptureMode, setViewportPresets } = state.presets;
  const { setActiveTabCapabilities } = state.environment;
  const { setIsReady } = state;

  useEffect(() => {
    setActiveTabCapabilities(capabilities);
  }, [capabilities, setActiveTabCapabilities]);

  useEffect(() => {
    let active = true;
    const recordingPromise =
      initialStartup.page === 'video' && initialStartup.recordingSnapshot
        ? Promise.resolve(initialStartup.recordingSnapshot)
        : loadRecordingStateResponseWithFallback(popupBootstrapTransport, () => undefined).then(
            toRecordingSnapshot
          );
    void Promise.all([
      loadPopupBootstrapVideoData(createPopupVideoBootstrapPromises()).catch(() => null),
      recordingPromise,
    ]).then(([video, recording]) => {
      if (!active) return;
      if (video) {
        setViewportPresets(video.viewportPresets);
        setSelectedPresetId(video.selectedPresetId);
        if (!(initialStartup.page === 'video' && initialStartup.videoMode)) {
          setVideoCaptureMode(video.captureMode);
        }
        setVideoSettings(video.videoSettings);
      }
      setRecordingState(recording.state);
      setStartError(video ? recording.statusError : translate('common.states.error'));
      setRecordingControlCapability(recording.controlCapability);
      setIsReady(true);
    });
    return () => {
      active = false;
    };
  }, [
    initialStartup,
    setIsReady,
    setRecordingControlCapability,
    setRecordingState,
    setSelectedPresetId,
    setStartError,
    setVideoCaptureMode,
    setVideoSettings,
    setViewportPresets,
  ]);
}

function VideoRouteView({
  captureMode,
  pageAccess,
  postRecordProps,
  runtime,
}: {
  captureMode: CaptureMode;
  pageAccess: PopupPageAccessRuntime;
  postRecordProps: Partial<
    Pick<VideoSetupPageProps, 'initialPostRecordResult' | 'initialPostRecordVerified'>
  >;
  runtime: Parameters<typeof getPopupVideoSetupProps>[0];
}) {
  const pageAccessControls = shouldShowVideoPageAccess(captureMode, pageAccess) ? (
    <PageAccessControls
      disabled={pageAccess.pendingOperation !== null}
      error={pageAccess.error}
      onRequest={(operation) => void pageAccess.handleRequest(operation)}
      pendingOperation={pageAccess.pendingOperation}
      status={pageAccess.status}
    />
  ) : null;

  return (
    <VideoSetupPage
      {...getPopupVideoSetupProps(runtime)}
      {...postRecordProps}
      {...(pageAccessControls ? { pageAccessControls } : {})}
    />
  );
}

function shouldShowVideoPageAccess(
  captureMode: CaptureMode,
  pageAccess: PopupPageAccessRuntime
): boolean {
  const modeNeedsPageAccess =
    captureMode === CaptureMode.TAB || captureMode === CaptureMode.TAB_CROP;
  return (
    modeNeedsPageAccess &&
    ((pageAccess.status?.supported === true && !pageAccess.status.currentTabActive) ||
      Boolean(pageAccess.error))
  );
}

function useVideoRecordingReconciliation(
  startup: PopupStartupDescriptor,
  recording: PopupVideoRuntimeStateSlice['recording']
): void {
  const { setIsStartPending, setRecordingControlCapability, setRecordingState, setStartError } =
    recording;
  useEffect(() => {
    if (startup.page !== 'video') return;
    if (startup.recordingSeed) {
      setRecordingState(startup.recordingSeed);
      if (startup.recordingSeed.status === 'IDLE') {
        setRecordingControlCapability(null);
      } else {
        setIsStartPending(false);
        setStartError(null);
      }
    }
    if (startup.recordingStartFailed) {
      setIsStartPending(false);
      setRecordingControlCapability(null);
      setStartError(startup.startError ?? translate('popup.video.startRecordingError'));
    }
  }, [setIsStartPending, setRecordingControlCapability, setRecordingState, setStartError, startup]);
}

function toRecordingSnapshot(
  response: Awaited<ReturnType<typeof loadRecordingStateResponseWithFallback>>
): PopupRecordingSnapshot {
  const recording = resolvePopupBootstrapRecordingState(response);
  return {
    controlCapability:
      typeof response.controlToken === 'string' && typeof response.recordingId === 'string'
        ? { controlToken: response.controlToken, recordingId: response.recordingId }
        : null,
    state: recording.recordingState,
    statusError: recording.recordingStatusError,
  };
}
