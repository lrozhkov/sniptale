import { RecordingDiscardConfirmation } from '../../composition/audio-recording/dialog/dismissal';
import { useState } from 'react';
import { Mic, Pause, Play, RotateCcw, Save, Square, X } from 'lucide-react';
import { ProductModal } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { useAudioRecordingDialogSession } from '../../composition/audio-recording/dialog/controller';
import { useAudioRecordingFocus } from '../../composition/audio-recording/dialog-focus';
import {
  AudioRecordingDeviceSelect,
  AudioRecordingDownloadButton,
  RecordingSetup,
} from '../../composition/audio-recording/dialog/controls';
import {
  RecordingDurationLimit,
  useRecordingDurationLimit,
} from '../../composition/audio-recording/dialog/duration-limit';
import { RecordingPlaybackChoice } from '../../composition/audio-recording/dialog/playback-choice';
import { RecordingLevelMeter } from '../../composition/audio-recording/dialog/level-meter';
import { renderAudioRecordingTrimPanel } from '../../composition/audio-recording/dialog/trim';
import { formatDurationLabel } from '../../composition/audio-recording/format';
import type { AudioTrimRange } from '../../composition/audio-recording/session-types';
import { translate } from '../../platform/i18n';
import type { useReviewVoiceoverRecording } from './voiceover-recording';

type RecordingSession = ReturnType<typeof useAudioRecordingDialogSession>;

/** Connect the Gallery recording session to its screen-space presentation. */
export function ReviewVoiceoverLayer(props: {
  voiceover: ReturnType<typeof useReviewVoiceoverRecording>;
}) {
  const { voiceover } = props;
  return (
    <ReviewVoiceoverRecording
      isOpen={voiceover.recording}
      playhead={voiceover.takeStart ?? 0}
      onClose={voiceover.close}
      onSyncStart={voiceover.syncStart}
      onSyncStop={voiceover.syncStop}
      onSyncPause={voiceover.syncPause}
      onSyncResume={voiceover.syncResume}
      onSave={voiceover.save}
    />
  );
}

/**
 * Gallery-owned lower strip over the shared capture controller; placement and playback stay local.
 */
export function ReviewVoiceoverRecording(props: {
  isOpen: boolean;
  playhead: number;
  onClose(): void;
  onSyncStart(playVideo: boolean): Promise<void>;
  onSyncStop(): void;
  onSyncPause?: () => void;
  onSyncResume?: (playVideo: boolean) => Promise<void>;
  onSave(
    file: File,
    trim: AudioTrimRange,
    signal: AbortSignal,
    take: Blob,
    onRetained?: () => void
  ): Promise<void>;
}) {
  const durationLimit = useRecordingDurationLimit();
  const [playVideo, setPlayVideo] = useState(true);
  const session = useAudioRecordingDialogSession({
    isOpen: props.isOpen,
    onClose: props.onClose,
    onSave: props.onSave,
    timeline: {
      startTime: props.playhead,
      duration: Infinity,
      beforeStart: () => props.onSyncStart(playVideo),
      onStop: props.onSyncStop,
      onPause: props.onSyncPause,
      onResume: async () => {
        await props.onSyncResume?.(playVideo);
      },
    },
    captureLimitSeconds: durationLimit.seconds,
  });
  const { titleId, handleKeyDown } = useAudioRecordingFocus(
    props.isOpen,
    session.confirmation.open
  );
  const { controller, starting, isSaving, saveError } = session;
  const { transport, trim } = controller;
  const capturing = transport.status === 'recording' || transport.status === 'paused';
  if (!props.isOpen) return null;
  return (
    <>
      <ProductModal
        onKeyDown={(event) => {
          handleKeyDown(event);
          if (event.key === 'Escape' && !event.defaultPrevented && !session.confirmation.open) {
            event.preventDefault();
            session.requestClose();
          }
          event.stopPropagation();
        }}
        onClose={session.requestClose}
        closeOnBackdrop={false}
        labelledBy={titleId}
        backdropClassName="!bg-[color:color-mix(in_srgb,var(--sniptale-color-overlay)_18%,transparent)]"
        dialogClassName="sniptale-compact-workspace !top-auto !bottom-3 !transform-[translate(-50%,0)] !rounded-lg"
        width="min(800px, calc(100vw - 32px))"
        maxHeight="calc(100vh - 24px)"
        scrollable
      >
        <div className="grid min-w-0 gap-3 p-4" data-ui="gallery.videoReview.voiceoverStrip">
          <header className="flex min-h-9 items-center gap-3">
            <span id={titleId} className="mr-auto min-w-0 text-sm font-medium">
              {translate('gallery.videoReview.recordVoiceover')}
              <span className="ml-2 inline-block text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
                {formatDurationLabel(props.playhead)}
              </span>
            </span>
            <ContentToolbarButton
              tone="close"
              className="!h-9 !w-9 !min-w-9 !px-0"
              disabled={isSaving}
              onClick={session.requestClose}
              title={translate('common.actions.close')}
            >
              <X size={16} aria-hidden="true" />
            </ContentToolbarButton>
          </header>
          {trim ? (
            <VoiceoverTakeReview session={session} durationLimit={durationLimit} />
          ) : (
            <>
              <VoiceoverCaptureOptions
                session={session}
                capturing={capturing}
                playVideo={playVideo}
                onPlayVideo={setPlayVideo}
                durationLimit={durationLimit}
              />
              <VoiceoverTransport
                session={session}
                limit={durationLimit.seconds}
                invalid={durationLimit.invalid}
              />
              <RecordingLevelMeter meter={controller.meter} preparing={starting} />
            </>
          )}
          {starting ? (
            <p role="status">{translate('videoEditor.app.recordAudioPreparing')}</p>
          ) : null}
          {saveError || transport.error ? (
            <p role="alert" className="text-xs text-[var(--sniptale-color-danger-text)]">
              {saveError || transport.error}
            </p>
          ) : null}
        </div>
      </ProductModal>
      <RecordingDiscardConfirmation
        dialogClassName="sniptale-compact-workspace"
        value={session.confirmation}
      />
    </>
  );
}

export function VoiceoverCaptureOptions(props: {
  session: RecordingSession;
  capturing: boolean;
  playVideo: boolean;
  onPlayVideo(value: boolean): void;
  durationLimit: ReturnType<typeof useRecordingDurationLimit>;
  maximum?: number;
}) {
  const disabled = props.session.starting || props.capturing;
  return (
    <RecordingSetup
      device={
        <AudioRecordingDeviceSelect
          menuClassName="sniptale-parameter-menu"
          value={props.session.deviceId}
          onChange={props.session.setDeviceId}
          disabled={disabled || props.session.isSaving}
        />
      }
      playback={
        <RecordingPlaybackChoice
          checked={props.playVideo}
          disabled={disabled || props.session.isSaving}
          onChange={props.onPlayVideo}
        />
      }
      duration={
        <RecordingDurationLimit
          value={props.durationLimit}
          {...(props.maximum !== undefined ? { maximum: props.maximum } : {})}
          disabled={disabled || props.session.isSaving}
        />
      }
    />
  );
}

export function VoiceoverTransport(props: {
  session: RecordingSession;
  limit: number | undefined;
  invalid: boolean;
}) {
  const { transport } = props.session.controller;
  const capturing = transport.status === 'recording' || transport.status === 'paused';
  return (
    <div
      className="flex flex-wrap items-center gap-3 border-t border-[var(--sniptale-color-border-soft)] pt-3 text-xs"
      role="status"
    >
      <span className="mr-auto inline-flex items-baseline gap-1 tabular-nums">
        {translate(
          capturing && props.limit !== undefined
            ? 'videoEditor.app.recordAudioRemaining'
            : 'videoEditor.app.recordAudioDurationLabel'
        )}{' '}
        <strong>
          {formatDurationLabel(
            capturing && props.limit !== undefined
              ? Math.max(0, props.limit - transport.elapsedSeconds)
              : transport.elapsedSeconds
          )}
        </strong>
      </span>
      {transport.status === 'recording' ? (
        <ProductActionButton tone="secondary" onClick={transport.pauseRecording}>
          <Pause size={16} aria-hidden="true" />
          {translate('videoEditor.app.recordAudioPause')}
        </ProductActionButton>
      ) : transport.status === 'paused' ? (
        <ProductActionButton tone="secondary" onClick={() => void transport.resumeRecording()}>
          <Play size={16} aria-hidden="true" />
          {translate('videoEditor.app.recordAudioResume')}
        </ProductActionButton>
      ) : null}
      {capturing ? (
        <ProductActionButton tone="secondary" onClick={transport.stopRecording}>
          <Square size={16} aria-hidden="true" />
          {translate('videoEditor.app.recordAudioStop')}
        </ProductActionButton>
      ) : (
        <ProductActionButton
          tone="primary"
          disabled={props.session.starting || props.invalid}
          onClick={props.session.startRecording}
        >
          <Mic size={16} aria-hidden="true" />
          {translate('videoEditor.app.recordAudioStart')}
        </ProductActionButton>
      )}
    </div>
  );
}

export function VoiceoverTakeReview({
  session,
  durationLimit,
  saveLabel,
}: {
  session: RecordingSession;
  durationLimit: ReturnType<typeof useRecordingDurationLimit>;
  saveLabel?: string;
}) {
  return (
    <>
      {durationLimit.invalid ? (
        <RecordingDurationLimit
          value={durationLimit}
          disabled={session.isSaving || session.starting}
        />
      ) : null}
      {renderAudioRecordingTrimPanel(
        session.controller.trim,
        session.isSaving || session.starting,
        true
      )}
      <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <AudioRecordingDownloadButton
          disabled={session.isSaving || session.isDownloading}
          onDownload={session.downloadTake}
        />
        <ProductActionButton
          tone="secondary"
          disabled={session.isSaving || session.starting || durationLimit.invalid}
          onClick={session.startRecording}
        >
          <RotateCcw size={16} aria-hidden="true" />
          {translate('videoEditor.app.recordAudioAgain')}
        </ProductActionButton>
        <ProductActionButton
          tone="primary"
          disabled={session.isSaving}
          onClick={() => void session.saveRecording()}
        >
          <Save size={16} aria-hidden="true" />
          {saveLabel ?? translate('videoEditor.app.recordAudioSave')}
        </ProductActionButton>
      </footer>
    </>
  );
}
