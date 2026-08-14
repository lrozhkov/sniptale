import '@sniptale/ui/styles';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import { useEffect, useRef } from 'react';
import { translate } from '../../../platform/i18n/popup';
import type {
  PopupRecordingSnapshot,
  PopupStartupDescriptor,
} from '../../shell/startup/descriptor';
import {
  createPopupVideoBootstrapPromises,
  loadPopupBootstrapVideoData,
} from '../../shell/bootstrap/video';
import { popupBootstrapTransport } from '../../shell/bootstrap/runtime';
import {
  loadRecordingStateResponseWithFallback,
  resolvePopupBootstrapRecordingState,
} from '../../shell/bootstrap/recording-state';
import { usePopupRuntimeHandlers } from '../../shell/runtime/handlers';
import { assemblePopupVideoRuntimeState } from '../../shell/runtime/assembly';
import type { PopupVideoRuntimeStateSlice } from '../../shell/runtime/types/internal-state';
import { usePopupPageAccessRuntime } from '../../shell/runtime/page-access';
import { useActiveTabCapabilities } from '../../shell/tab-access/capabilities';
import { getPopupVideoSetupProps } from '../../shell/app-shell/video-setup/props';
import VideoSetupPage from './setup';
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
    setIsReady,
    setRecordingControlCapability,
    setRecordingState,
    setSelectedPresetId,
    setStartError,
    setVideoCaptureMode,
    setVideoSettings,
    setViewportPresets,
    initialStartup,
  ]);
  useVideoRecordingReconciliation(startup, state.recording);

  const postRecordProps =
    initialStartup.page === 'video' && initialStartup.postRecordSnapshot
      ? {
          initialPostRecordResult: initialStartup.postRecordSnapshot.result,
          initialPostRecordVerified: true,
        }
      : {};

  return <VideoSetupPage {...getPopupVideoSetupProps(runtime)} {...postRecordProps} />;
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
