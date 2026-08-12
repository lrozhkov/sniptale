import {
  CircleStop,
  LoaderCircle,
  Mic,
  MicOff,
  Pause,
  Pin,
  Play,
  ScanEye,
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
import { useState } from 'react';
import { RecordingDrawingControls, type RecordingDrawingInteractionMode } from './drawing-controls';
import { RecordingMediaSplitControl } from './media-menu';

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
  if (props.state.phase === 'idle') return null;
  return (
    <div
      className="sniptale-timer-badge"
      data-ui="content.toolbar.video-recording.status"
      aria-live="polite"
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--sniptale-color-danger)]" />
      {formatDuration(props.state.durationSeconds)}
    </div>
  );
}

function RecordingLifecycleControl(props: { recording: ToolbarVideoRecordingProps }) {
  const { state } = props.recording;
  if (state.phase === 'starting') {
    return (
      <ContentToolbarButton
        title={translate('content.toolbar.videoRecordingCancelStart')}
        onClick={() => void props.recording.onCancelStart()}
      >
        <X size={18} />
      </ContentToolbarButton>
    );
  }
  if (state.phase === 'recording' || state.phase === 'paused') {
    const paused = state.phase === 'paused';
    return (
      <>
        <ContentToolbarButton
          active={paused}
          title={translate(
            paused ? 'content.toolbar.videoRecordingResume' : 'content.toolbar.videoRecordingPause'
          )}
          onClick={() => void (paused ? props.recording.onResume() : props.recording.onPause())}
        >
          {paused ? <Play size={18} /> : <Pause size={18} />}
        </ContentToolbarButton>
        <ContentToolbarButton
          tone="danger"
          title={translate('content.toolbar.videoRecordingStop')}
          onClick={() => void props.recording.onStop()}
        >
          <CircleStop size={18} />
        </ContentToolbarButton>
      </>
    );
  }
  if (state.phase === 'stopping') {
    return (
      <ContentToolbarButton disabled title={translate('content.toolbar.videoRecordingStopping')}>
        <LoaderCircle size={18} className="animate-spin" />
      </ContentToolbarButton>
    );
  }
  return (
    <ContentToolbarButton
      tone="danger"
      title={translate('content.toolbar.videoRecordingStart')}
      onClick={(event) => void props.recording.onStart(event.nativeEvent)}
    >
      <Video size={18} />
    </ContentToolbarButton>
  );
}

function MediaControls(props: { recording: ToolbarVideoRecordingProps }) {
  const busy =
    props.recording.state.phase === 'starting' || props.recording.state.phase === 'stopping';
  return (
    <ContentToolbarGroup aria-label={translate('content.toolbar.videoRecordingMedia')}>
      <RecordingMediaSplitControl
        active={props.recording.state.microphoneEnabled}
        activeIcon={Mic}
        disabled={busy}
        inactiveIcon={MicOff}
        kind="audioinput"
        label={translate('content.toolbar.videoRecordingMicrophone')}
        selectedDeviceId={props.recording.state.microphoneDeviceId}
        onToggle={() =>
          props.recording.onMicrophoneEnabledChange(!props.recording.state.microphoneEnabled)
        }
        {...(props.recording.onMicrophoneDeviceChange
          ? {
              onDeviceChange: (deviceId) =>
                void props.recording.onMicrophoneDeviceChange?.(deviceId),
            }
          : {})}
      />
      <RecordingMediaSplitControl
        active={props.recording.state.cameraEnabled}
        activeIcon={Video}
        disabled={busy}
        inactiveIcon={VideoOff}
        kind="videoinput"
        label={translate('content.toolbar.videoRecordingCamera')}
        selectedDeviceId={props.recording.state.webcamDeviceId}
        onToggle={() => props.recording.onCameraEnabledChange(!props.recording.state.cameraEnabled)}
        {...(props.recording.onCameraDeviceChange
          ? { onDeviceChange: (deviceId) => void props.recording.onCameraDeviceChange?.(deviceId) }
          : {})}
      />
    </ContentToolbarGroup>
  );
}

export function ToolbarVideoRecordingControls(props: {
  compactMenus?: boolean;
  displayMode: ContentToolbarDisplayMode;
  recording: ToolbarVideoRecordingProps;
}) {
  const navigation = props.recording.state.interaction === 'navigation';
  const busy =
    props.recording.state.phase === 'starting' || props.recording.state.phase === 'stopping';
  const [interactionMode, setInteractionMode] =
    useState<RecordingDrawingInteractionMode>('navigation');
  const setMode = (mode: RecordingDrawingInteractionMode) => {
    setInteractionMode(mode);
    props.recording.onInteractionChange(mode === 'navigation' ? 'navigation' : 'drawing');
  };
  return (
    <>
      <ContentToolbarGroup aria-label={translate('content.toolbar.videoRecordingModeControls')}>
        <ContentToolbarButton
          active
          disabled
          title={translate('content.toolbar.videoRecordingPinned')}
        >
          <Pin size={18} />
        </ContentToolbarButton>
      </ContentToolbarGroup>
      <RecordingDrawingControls
        compactMenus={props.compactMenus ?? false}
        displayMode={props.displayMode}
        interactionMode={navigation ? 'navigation' : interactionMode}
        disabled={busy}
        owner={props.recording.drawingOwner}
        onInteractionModeChange={setMode}
      />
      <ContentToolbarGroup aria-label={translate('content.toolbar.videoRecordingSpotlight')}>
        <ContentToolbarButton
          active={props.recording.state.spotlightEnabled && navigation}
          disabled={busy || !navigation}
          title={translate('content.toolbar.videoRecordingSpotlight')}
          onClick={() =>
            void props.recording.onSpotlightEnabledChange(!props.recording.state.spotlightEnabled)
          }
        >
          <ScanEye size={18} />
        </ContentToolbarButton>
      </ContentToolbarGroup>
      <ContentToolbarDivider />
      <MediaControls recording={props.recording} />
      <ContentToolbarGroup aria-label={translate('content.toolbar.videoRecordingActions')}>
        <RecordingStatus state={props.recording.state} />
        <RecordingLifecycleControl recording={props.recording} />
      </ContentToolbarGroup>
    </>
  );
}
