import {
  Circle,
  LoaderCircle,
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import {
  ContentToolbarButton,
  ContentToolbarDivider,
  ContentToolbarGroup,
} from '@sniptale/ui/content-toolbar';
import { translate } from '../../../../platform/i18n';
import type { ToolbarVideoRecordingProps } from '../types';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RecordingDrawingControls, type RecordingDrawingInteractionMode } from './drawing-controls';
import { RecordingMediaSplitControl } from './media-menu';
import { RecordingSpotlightMenu } from './spotlight-menu';
import { ToolbarSettingsMenu } from '../capture/settings';
import type { ToolbarMenuState } from '../state/menu';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';

function formatDuration(durationSeconds: number): string {
  const seconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function RecordingStatus(props: { state: ToolbarVideoRecordingProps['state'] }) {
  const showDuration =
    props.state.phase === 'recording' ||
    props.state.phase === 'paused' ||
    props.state.phase === 'stopping';
  if (!showDuration && !props.state.error) return null;
  return (
    <div
      aria-live="polite"
      className="sniptale-video-recording-status"
      data-ui="content.toolbar.video-recording.status"
    >
      {showDuration ? (
        <span className="sniptale-video-recording-duration">
          {formatDuration(props.state.durationSeconds)}
        </span>
      ) : null}
    </div>
  );
}

function useRecordingErrorToast(error: string | null): void {
  const shownErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!error) {
      shownErrorRef.current = null;
      return;
    }
    if (shownErrorRef.current === error) return;
    shownErrorRef.current = error;
    showToast(error, 'error');
  }, [error]);
}

function runToolbarAction(action: () => Promise<void> | void): void {
  void Promise.resolve(action()).catch(() => {
    // The controller projects the failure into the toolbar state.
  });
}

function RecordingLifecycleControl(props: { recording: ToolbarVideoRecordingProps }) {
  const { state } = props.recording;
  if (state.phase === 'starting') {
    return (
      <>
        <ContentToolbarButton
          dataUi="content.toolbar.video-recording.cancel-start"
          title={translate('content.toolbar.videoRecordingCancelStart')}
          onClick={() => runToolbarAction(props.recording.onCancelStart)}
        >
          <X size={18} />
        </ContentToolbarButton>
      </>
    );
  }
  if (state.phase === 'recording' || state.phase === 'paused') {
    const paused = state.phase === 'paused';
    return (
      <>
        <ContentToolbarButton
          dataUi={
            paused
              ? 'content.toolbar.video-recording.resume'
              : 'content.toolbar.video-recording.pause'
          }
          active={paused}
          title={translate(
            paused ? 'content.toolbar.videoRecordingResume' : 'content.toolbar.videoRecordingPause'
          )}
          onClick={() =>
            runToolbarAction(paused ? props.recording.onResume : props.recording.onPause)
          }
        >
          {paused ? (
            <Play style={{ height: 16, width: 16 }} strokeWidth={2.25} />
          ) : (
            <Pause style={{ height: 16, width: 16 }} strokeWidth={2.25} />
          )}
        </ContentToolbarButton>
        <ContentToolbarButton
          dataUi="content.toolbar.video-recording.stop"
          tone="danger"
          title={translate('content.toolbar.videoRecordingStop')}
          onClick={() => runToolbarAction(props.recording.onStop)}
        >
          <Square style={{ height: 13, width: 13 }} fill="currentColor" strokeWidth={2} />
        </ContentToolbarButton>
      </>
    );
  }
  if (state.phase === 'stopping') {
    return (
      <>
        <ContentToolbarButton
          disabled
          dataUi="content.toolbar.video-recording.stopping"
          title={translate('content.toolbar.videoRecordingStopping')}
        >
          <LoaderCircle size={18} className="animate-spin" />
        </ContentToolbarButton>
      </>
    );
  }
  return (
    <>
      <ContentToolbarButton
        dataUi="content.toolbar.video-recording.start"
        tone="danger"
        title={translate('content.toolbar.videoRecordingStartHint')}
        onClick={(event) => void props.recording.onStart(event.nativeEvent)}
      >
        <Circle
          style={{ height: 13, width: 13 }}
          fill="currentColor"
          strokeWidth={2}
          className="text-[var(--sniptale-color-danger)]"
        />
      </ContentToolbarButton>
    </>
  );
}

function MediaControls(props: {
  displayMode: ContentToolbarDisplayMode;
  recording: ToolbarVideoRecordingProps;
  toolbarMenuState: ToolbarMenuState;
}) {
  const { onLoadMediaDevices } = props.recording;
  const busy =
    props.recording.state.phase === 'starting' || props.recording.state.phase === 'stopping';
  const loadMicrophones = useCallback(
    () => onLoadMediaDevices?.('audioinput') ?? Promise.resolve([]),
    [onLoadMediaDevices]
  );
  const loadCameras = useCallback(
    () => onLoadMediaDevices?.('videoinput') ?? Promise.resolve([]),
    [onLoadMediaDevices]
  );
  return (
    <ContentToolbarGroup aria-label={translate('content.toolbar.videoRecordingMedia')}>
      <RecordingMediaSplitControl
        active={props.recording.state.microphoneEnabled}
        activeIcon={Mic}
        disabled={busy}
        inactiveIcon={MicOff}
        kind="audioinput"
        dataUi="content.toolbar.video-recording.microphone"
        displayMode={props.displayMode}
        label={translate('content.toolbar.videoRecordingMicrophone')}
        selectedDeviceId={props.recording.state.microphoneDeviceId}
        menuType="recording-microphone"
        toolbarMenuState={props.toolbarMenuState}
        {...(onLoadMediaDevices ? { onLoadDevices: loadMicrophones } : {})}
        onToggle={() =>
          props.recording.onMicrophoneEnabledChange(!props.recording.state.microphoneEnabled)
        }
        {...(props.recording.onMicrophoneDeviceChange
          ? {
              onDeviceChange: (deviceId) => props.recording.onMicrophoneDeviceChange?.(deviceId),
            }
          : {})}
      />
      <RecordingMediaSplitControl
        active={props.recording.state.cameraEnabled}
        activeIcon={Video}
        disabled={busy}
        inactiveIcon={VideoOff}
        kind="videoinput"
        dataUi="content.toolbar.video-recording.camera"
        displayMode={props.displayMode}
        label={translate('content.toolbar.videoRecordingCamera')}
        selectedDeviceId={props.recording.state.webcamDeviceId}
        menuType="recording-camera"
        toolbarMenuState={props.toolbarMenuState}
        {...(onLoadMediaDevices ? { onLoadDevices: loadCameras } : {})}
        onToggle={() => props.recording.onCameraEnabledChange(!props.recording.state.cameraEnabled)}
        {...(props.recording.onCameraDeviceChange
          ? { onDeviceChange: (deviceId) => props.recording.onCameraDeviceChange?.(deviceId) }
          : {})}
      />
    </ContentToolbarGroup>
  );
}

export function ToolbarVideoRecordingControls(props: {
  compactMenus?: boolean;
  displayMode: ContentToolbarDisplayMode;
  onCollapse(): void;
  onCompactMenusChange(compact: boolean): void;
  onDisplayModeChange(displayMode: ContentToolbarDisplayMode): void;
  recording: ToolbarVideoRecordingProps;
  toolbarMenuState: ToolbarMenuState;
}) {
  useRecordingErrorToast(props.recording.state.error);
  const navigation = props.recording.state.interaction === 'navigation';
  const busy =
    props.recording.state.phase === 'starting' || props.recording.state.phase === 'stopping';
  const [interactionMode, setInteractionMode] =
    useState<RecordingDrawingInteractionMode>('navigation');
  const setMode = (mode: RecordingDrawingInteractionMode) => {
    setInteractionMode(mode);
    props.recording.onInteractionChange(mode === 'navigation' ? 'navigation' : 'drawing');
  };
  const collapse = () => {
    setMode('navigation');
    props.onCollapse();
  };
  return (
    <>
      <ContentToolbarGroup dataUi="content.toolbar.video-recording.settings-group">
        <ToolbarSettingsMenu
          compactMenus={props.compactMenus ?? false}
          displayMode={props.displayMode}
          onClose={collapse}
          onCompactMenusChange={props.onCompactMenusChange}
          onDisableScreenshotMode={() => undefined}
          onDisplayModeChange={props.onDisplayModeChange}
          onPinToTabChange={() => undefined}
          pinToTab
          pinToTabAvailable
          pinToTabLocked
          screenshotMode={false}
          showPinItem={false}
          toolbarMenuState={props.toolbarMenuState}
        />
      </ContentToolbarGroup>
      <ContentToolbarDivider />
      {props.displayMode === 'vertical' ? (
        <ContentToolbarGroup
          aria-label={translate('content.toolbar.videoRecordingActions')}
          className="sniptale-video-recording-lifecycle"
          dataUi="content.toolbar.video-recording.lifecycle"
        >
          <RecordingStatus state={props.recording.state} />
          <RecordingLifecycleControl recording={props.recording} />
        </ContentToolbarGroup>
      ) : null}
      <RecordingDrawingControls
        actionTail={
          <RecordingSpotlightMenu
            compact={props.compactMenus ?? false}
            disabled={busy || !navigation}
            displayMode={props.displayMode}
            toolbarMenuState={props.toolbarMenuState}
            settings={{
              cursorHaloEnabled: props.recording.state.spotlightEnabled,
              cursorDimmingEnabled: props.recording.state.spotlightDimmingEnabled,
              clickAnimationEnabled: props.recording.state.spotlightClickAnimationEnabled,
            }}
            onChange={(settings) => {
              if (props.recording.onSpotlightSettingsChange) {
                return props.recording.onSpotlightSettingsChange(settings);
              }
              return props.recording.onSpotlightEnabledChange(settings.cursorHaloEnabled);
            }}
          />
        }
        compactMenus={props.compactMenus ?? false}
        displayMode={props.displayMode}
        interactionMode={navigation ? 'navigation' : interactionMode}
        disabled={busy}
        owner={props.recording.drawingOwner}
        toolbarMenuState={props.toolbarMenuState}
        {...(props.recording.onAutoHideDelayChange
          ? { onAutoHideDelayChange: props.recording.onAutoHideDelayChange }
          : {})}
        onInteractionModeChange={setMode}
      />
      <ContentToolbarDivider />
      <MediaControls
        displayMode={props.displayMode}
        recording={props.recording}
        toolbarMenuState={props.toolbarMenuState}
      />
      {props.displayMode === 'horizontal' ? (
        <ContentToolbarGroup
          aria-label={translate('content.toolbar.videoRecordingActions')}
          className="sniptale-video-recording-lifecycle"
          dataUi="content.toolbar.video-recording.lifecycle"
        >
          <RecordingStatus state={props.recording.state} />
          <RecordingLifecycleControl recording={props.recording} />
        </ContentToolbarGroup>
      ) : null}
    </>
  );
}
