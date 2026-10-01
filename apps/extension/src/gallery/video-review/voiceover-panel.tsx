import { RecordingDiscardConfirmation } from '../../composition/audio-recording/dialog/dismissal';
import { useEffect, useState, type RefObject } from 'react';
import { Mic, Pause, Play, RotateCcw, Save, Square, X } from 'lucide-react';
import { ProductModal } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useAudioRecordingDialogSession } from '../../composition/audio-recording/dialog/controller';
import { useAudioRecordingFocus } from '../../composition/audio-recording/dialog-focus';
import { AudioRecordingDeviceSelect } from '../../composition/audio-recording/dialog/controls';
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
  outputTime: number | null;
  resultDuration: number;
}) {
  const { voiceover } = props;
  return (
    <ReviewVoiceoverRecording
      isOpen={voiceover.recording}
      video={voiceover.video}
      playhead={voiceover.takeOutputStart ?? props.outputTime ?? 0}
      timelineDuration={props.resultDuration}
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
  video?: RefObject<HTMLVideoElement | null>;
  playhead: number;
  timelineDuration: number;
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
  const remaining = Math.max(0, props.timelineDuration - props.playhead);
  const durationLimit = useRecordingDurationLimit(remaining);
  const [playVideo, setPlayVideo] = useState(true);
  const session = useAudioRecordingDialogSession({
    isOpen: props.isOpen,
    onClose: props.onClose,
    onSave: props.onSave,
    timeline: {
      startTime: props.playhead,
      duration: remaining,
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
  const stopRecording = transport.stopRecording;
  useEffect(() => {
    if (!props.isOpen || !playVideo || transport.status !== 'recording') return;
    const video = props.video?.current;
    if (!video) return;
    const onEnded = () => stopRecording();
    video.addEventListener('ended', onEnded);
    return () => video.removeEventListener('ended', onEnded);
  }, [playVideo, props.isOpen, props.video, transport.status, stopRecording]);
  if (!props.isOpen) return null;
  return (
    <>
      <ProductModal
        onKeyDown={(event) => {
          handleKeyDown(event);
          if (event.key === 'Escape' && !session.confirmation.open) {
            event.preventDefault();
            session.requestClose();
          }
          event.stopPropagation();
        }}
        onClose={session.requestClose}
        closeOnBackdrop={false}
        labelledBy={titleId}
        backdropClassName="!bg-[color:color-mix(in_srgb,var(--sniptale-color-overlay)_18%,transparent)]"
        dialogClassName="!top-auto !bottom-3 !transform-[translate(-50%,0)] !rounded-lg"
        width="min(800px, calc(100vw - 32px))"
        maxHeight="calc(100vh - 24px)"
        scrollable
      >
        <div className="grid gap-2 px-3 py-2" data-ui="gallery.videoReview.voiceoverStrip">
          <div className="flex flex-wrap items-center gap-2">
            <span id={titleId} className="mr-auto text-sm font-medium">
              {translate('gallery.videoReview.recordVoiceover')}
              <span className="ml-2 tabular-nums text-[var(--sniptale-color-text-muted)]">
                {formatDurationLabel(props.playhead)}–{formatDurationLabel(props.timelineDuration)}
              </span>
            </span>
            <ProductActionButton
              tone="secondary"
              disabled={isSaving}
              onClick={session.requestClose}
              aria-label={translate('common.actions.close')}
            >
              <X size={16} aria-hidden="true" />
            </ProductActionButton>
          </div>
          {trim ? (
            <VoiceoverTakeReview
              session={session}
              durationLimit={durationLimit}
              maximum={remaining}
            />
          ) : (
            <>
              <VoiceoverCaptureOptions
                session={session}
                capturing={capturing}
                playVideo={playVideo}
                onPlayVideo={setPlayVideo}
                durationLimit={durationLimit}
                maximum={remaining}
              />
              <VoiceoverTransport
                session={session}
                remaining={remaining}
                limit={durationLimit.effective}
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
      <RecordingDiscardConfirmation value={session.confirmation} />
    </>
  );
}

function VoiceoverCaptureOptions(props: {
  session: RecordingSession;
  capturing: boolean;
  playVideo: boolean;
  onPlayVideo(value: boolean): void;
  durationLimit: ReturnType<typeof useRecordingDurationLimit>;
  maximum: number;
}) {
  const disabled = props.session.starting || props.capturing;
  return (
    <div
      className={[
        'flex flex-wrap items-center gap-2 rounded-md border p-2',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)]',
      ].join(' ')}
    >
      <div className="w-44 min-w-0">
        <AudioRecordingDeviceSelect
          value={props.session.deviceId}
          onChange={props.session.setDeviceId}
          disabled={disabled || props.session.isSaving}
        />
      </div>
      <RecordingPlaybackChoice
        checked={props.playVideo}
        disabled={disabled || props.session.isSaving}
        onChange={props.onPlayVideo}
      />
      <div className="ml-auto">
        <RecordingDurationLimit
          value={props.durationLimit}
          maximum={props.maximum}
          disabled={disabled || props.session.isSaving}
        />
      </div>
    </div>
  );
}

function VoiceoverTransport(props: {
  session: RecordingSession;
  remaining: number;
  limit: number;
  invalid: boolean;
}) {
  const { transport } = props.session.controller;
  const capturing = transport.status === 'recording' || transport.status === 'paused';
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs" role="status">
      <span className="mr-auto tabular-nums">
        {translate(
          capturing ? 'videoEditor.app.recordAudioRemaining' : 'videoEditor.app.recordAudioLimit'
        )}{' '}
        <strong>
          {formatDurationLabel(
            capturing ? Math.max(0, props.limit - transport.elapsedSeconds) : props.remaining
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
          disabled={props.session.starting || props.remaining <= 0 || props.invalid}
          onClick={props.session.startRecording}
        >
          <Mic size={16} aria-hidden="true" />
          {translate('videoEditor.app.recordAudioStart')}
        </ProductActionButton>
      )}
    </div>
  );
}

function VoiceoverTakeReview({
  session,
  durationLimit,
  maximum,
}: {
  session: RecordingSession;
  durationLimit: ReturnType<typeof useRecordingDurationLimit>;
  maximum: number;
}) {
  return (
    <>
      {durationLimit.invalid ? (
        <RecordingDurationLimit
          value={durationLimit}
          maximum={maximum}
          disabled={session.isSaving || session.starting}
        />
      ) : null}
      {renderAudioRecordingTrimPanel(
        session.controller.trim,
        session.isSaving || session.starting,
        true
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <ProductActionButton
          tone="secondary"
          disabled={session.isSaving || session.starting || durationLimit.invalid || maximum <= 0}
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
          {translate('videoEditor.app.recordAudioSave')}
        </ProductActionButton>
      </div>
    </>
  );
}
