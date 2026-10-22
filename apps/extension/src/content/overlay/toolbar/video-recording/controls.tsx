import {
  Check,
  LoaderCircle,
  Mic,
  MicOff,
  MousePointer2,
  Pause,
  Play,
  Square,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { Icon } from '@iconify/react';
import eyeCogIcon from '@iconify-icons/tabler/eye-cog';
import { RecordingIcon } from '../../../../ui/recording-icon';
import {
  ContentToolbarButton,
  ContentToolbarDivider,
  ContentToolbarGroup,
} from '@sniptale/ui/content-toolbar';
import { translate } from '../../../../platform/i18n';
import type { ToolbarVideoRecordingProps } from '../types';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { RecordingDrawingControls, type RecordingDrawingInteractionMode } from './drawing-controls';
import { RecordingMediaSplitControl } from './media-menu';
import { applyWebcamPresentationPatch } from '../../../../features/video/recording/webcam-presentation';
import { RecordingSpotlightMenu } from './spotlight-menu';
import { ToolbarSettingsMenu } from '../capture/settings';
import type { ToolbarMenuState } from '../state/menu';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { RecordingStartConfirmation } from './start-confirmation';
import { RecordingToolbarControlsContext } from '../state/recording-controls';
import { RecordingControlVisibility } from './control-visibility';

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

function RecordingLifecycleControl(props: {
  recording: ToolbarVideoRecordingProps;
  displayMode: ContentToolbarDisplayMode;
  toolbarMenuState: ToolbarMenuState;
}) {
  const { state } = props.recording;
  const visibility = useContext(RecordingToolbarControlsContext);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    setConfirmationOpen(false);
  }, [state.microphoneEnabled, state.recordingId]);
  const cancelConfirmation = useCallback(() => {
    setConfirmationOpen(false);
    triggerRef.current?.focus();
  }, []);
  const start = async (event: Event, rememberChoice?: boolean) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    props.toolbarMenuState.closeMenus();
    try {
      const result =
        rememberChoice === undefined
          ? await props.recording.onStart(event)
          : await props.recording.onStart(event, {
              confirmedWithoutMicrophone: true,
              rememberWithoutMicrophone: rememberChoice,
            });
      if (mountedRef.current) setConfirmationOpen(result === 'confirmation-required');
    } finally {
      pendingRef.current = false;
    }
  };
  if (state.phase === 'starting') {
    return (
      <>
        <ContentToolbarButton
          tone="close"
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
          data-content-command="true"
          title={translate(
            paused ? 'content.toolbar.videoRecordingResume' : 'content.toolbar.videoRecordingPause'
          )}
          onClick={() =>
            runToolbarAction(paused ? props.recording.onResume : props.recording.onPause)
          }
        >
          {paused ? <Play size={18} /> : <Pause size={18} />}
        </ContentToolbarButton>
        <ContentToolbarButton
          dataUi="content.toolbar.video-recording.stop"
          title={translate('content.toolbar.videoRecordingStop')}
          onClick={() => runToolbarAction(props.recording.onStop)}
        >
          <Square size={16} fill="currentColor" className="text-[var(--sniptale-color-danger)]" />
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
        ref={triggerRef}
        disabled={visibility?.editing || visibility?.pending}
        dataUi="content.toolbar.video-recording.start"
        tone="default"
        title={translate('content.toolbar.videoRecordingStartHint')}
        onClick={(event) => void start(event.nativeEvent)}
        aria-expanded={confirmationOpen}
        aria-haspopup="dialog"
      >
        <RecordingIcon size={18} className="text-[var(--sniptale-color-danger)]" />
      </ContentToolbarButton>
      {confirmationOpen ? (
        <RecordingStartConfirmation
          displayMode={props.displayMode}
          triggerRef={triggerRef}
          onCancel={cancelConfirmation}
          onContinue={(event, rememberChoice) => void start(event, rememberChoice)}
        />
      ) : null}
    </>
  );
}

function MediaControls(props: {
  displayMode: ContentToolbarDisplayMode;
  recording: ToolbarVideoRecordingProps;
  toolbarMenuState: ToolbarMenuState;
}) {
  const visibility = useContext(RecordingToolbarControlsContext);
  const { onLoadMediaDevices } = props.recording;
  const busy =
    props.recording.state.phase === 'starting' || props.recording.state.phase === 'stopping';
  const loadMicrophones = useCallback(
    (requestPermission = true) =>
      onLoadMediaDevices?.('audioinput', requestPermission) ?? Promise.resolve([]),
    [onLoadMediaDevices]
  );
  const loadCameras = useCallback(
    (requestPermission = true) =>
      onLoadMediaDevices?.('videoinput', requestPermission) ?? Promise.resolve([]),
    [onLoadMediaDevices]
  );
  if (
    visibility?.active &&
    visibility.controls.microphone === false &&
    visibility.controls.camera === false
  )
    return null;
  return (
    <ContentToolbarGroup aria-label={translate('content.toolbar.videoRecordingMedia')}>
      <RecordingControlVisibility
        control="microphone"
        icon={Mic}
        label={translate('content.toolbar.videoRecordingMicrophone')}
      >
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
          {...(props.recording.onMicrophoneGainChange
            ? {
                microphoneGain: {
                  value: props.recording.state.microphoneGain ?? 1,
                  onChange: props.recording.onMicrophoneGainChange,
                },
              }
            : {})}
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
      </RecordingControlVisibility>
      <RecordingControlVisibility
        control="camera"
        icon={Video}
        label={translate('content.toolbar.videoRecordingCamera')}
      >
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
          {...(props.recording.onCameraPresentationModeChange
            ? {
                cameraPlacement: {
                  mode: props.recording.state.webcamPresentation.mode,
                  presentation: props.recording.state.webcamPresentation,
                  onPreview: (patch) =>
                    props.recording.onCameraGeometryPreview?.(
                      patch
                        ? applyWebcamPresentationPatch(
                            props.recording.state.webcamPresentation,
                            patch
                          )
                        : null
                    ),
                  onAppearanceChange: (patch) => props.recording.onCameraGeometryChange(patch),
                  locked:
                    props.recording.state.phase !== 'idle' &&
                    props.recording.state.phase !== 'error',
                  onChange: props.recording.onCameraPresentationModeChange,
                },
              }
            : {})}
          {...(onLoadMediaDevices ? { onLoadDevices: loadCameras } : {})}
          onToggle={() =>
            props.recording.onCameraEnabledChange(!props.recording.state.cameraEnabled)
          }
          {...(props.recording.onCameraDeviceChange
            ? { onDeviceChange: (deviceId) => props.recording.onCameraDeviceChange?.(deviceId) }
            : {})}
        />
      </RecordingControlVisibility>
    </ContentToolbarGroup>
  );
}

export function ToolbarVideoRecordingControls(props: {
  compactMenus?: boolean;
  displayMode: ContentToolbarDisplayMode;
  freePlacement?: boolean;
  onFreePlacementChange?: ((value: boolean) => void) | undefined;
  onCollapse(restoreFocus?: boolean): void;
  onCompactMenusChange(compact: boolean): void;
  onDisplayModeChange(displayMode: ContentToolbarDisplayMode): void;
  recording: ToolbarVideoRecordingProps;
  toolbarMenuState: ToolbarMenuState;
}) {
  const visibility = useContext(RecordingToolbarControlsContext);
  useRecordingErrorToast(visibility?.error ?? props.recording.state.error);
  const navigation = props.recording.state.interaction === 'navigation';
  const busy =
    props.recording.state.phase === 'starting' || props.recording.state.phase === 'stopping';
  const [interactionMode, setInteractionMode] =
    useState<RecordingDrawingInteractionMode>('navigation');
  const setMode = (mode: RecordingDrawingInteractionMode) => {
    setInteractionMode(mode);
    props.recording.onInteractionChange(mode === 'navigation' ? 'navigation' : 'drawing');
  };
  const collapse = (restoreFocus?: boolean) => {
    setMode('navigation');
    props.onCollapse(restoreFocus);
  };
  return (
    <>
      {!visibility?.active ? (
        <>
          <ContentToolbarGroup dataUi="content.toolbar.video-recording.settings-group">
            <fieldset disabled={visibility?.editing} className="contents">
              <ToolbarSettingsMenu
                compactMenus={props.compactMenus ?? false}
                displayMode={props.displayMode}
                onClose={collapse}
                onCompactMenusChange={props.onCompactMenusChange}
                onDisableScreenshotMode={() => undefined}
                onDisplayModeChange={props.onDisplayModeChange}
                freePlacement={props.freePlacement ?? true}
                onFreePlacementChange={props.onFreePlacementChange}
                onPinToTabChange={() => undefined}
                pinToTab
                pinToTabAvailable
                pinToTabLocked
                screenshotMode={false}
                showPinItem={false}
                toolbarMenuState={props.toolbarMenuState}
              />
            </fieldset>
            <ContentToolbarButton
              type="button"
              tone="property"
              aria-pressed={visibility?.editing ?? false}
              disabled={
                !visibility || visibility.pending || (!visibility.ready && !visibility.error)
              }
              dataUi="content.toolbar.video-recording.customize"
              title={translate(
                visibility?.editing
                  ? 'content.toolbar.recordingCustomizeDone'
                  : 'content.toolbar.recordingCustomizeControls'
              )}
              onClick={() => {
                props.toolbarMenuState.closeMenus();
                setMode('navigation');
                if (visibility?.ready) visibility.toggleEditing();
                else void visibility?.reload();
              }}
            >
              {visibility?.editing ? (
                <Check size={18} />
              ) : (
                <Icon
                  icon={eyeCogIcon}
                  width={18}
                  height={18}
                  className="tabler-eye-cog"
                  aria-hidden="true"
                />
              )}
            </ContentToolbarButton>
          </ContentToolbarGroup>
          <ContentToolbarDivider />
        </>
      ) : null}
      <RecordingDrawingControls
        actionTail={
          <RecordingControlVisibility
            control="cursor"
            icon={MousePointer2}
            label={translate('content.toolbar.videoRecordingSpotlight')}
          >
            <RecordingSpotlightMenu
              compact={props.compactMenus ?? false}
              disabled={busy || !navigation}
              displayMode={props.displayMode}
              toolbarMenuState={props.toolbarMenuState}
              settings={{
                cursorHaloEnabled: props.recording.state.spotlightEnabled,
                cursorDimmingEnabled: props.recording.state.spotlightDimmingEnabled,
                clickAnimationEnabled: props.recording.state.spotlightClickAnimationEnabled,
                ...(props.recording.state.cursorEffects
                  ? { cursorEffects: props.recording.state.cursorEffects }
                  : {}),
              }}
              onChange={(settings) => {
                if (props.recording.onSpotlightSettingsChange) {
                  return props.recording.onSpotlightSettingsChange(settings);
                }
                return props.recording.onSpotlightEnabledChange(settings.cursorHaloEnabled);
              }}
            />
          </RecordingControlVisibility>
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
      <ContentToolbarGroup
        aria-label={translate('content.toolbar.videoRecordingActions')}
        className="sniptale-video-recording-lifecycle"
        dataUi="content.toolbar.video-recording.lifecycle"
      >
        <RecordingStatus state={props.recording.state} />
        <RecordingLifecycleControl
          recording={props.recording}
          displayMode={props.displayMode}
          toolbarMenuState={props.toolbarMenuState}
        />
      </ContentToolbarGroup>
    </>
  );
}
