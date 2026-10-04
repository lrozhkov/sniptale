import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Mic, Pause, Play, RotateCcw, Save, Square, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../platform/i18n';
import type { AudioRecordingControllerState } from '../../../composition/audio-recording/session-types';
import { formatDurationLabel } from '../../../composition/audio-recording/format';
import { renderAudioRecordingTrimPanel } from '../../../composition/audio-recording/dialog/trim';
import {
  AudioRecordingDownloadButton,
  RecordingSetup,
} from '../../../composition/audio-recording/dialog/controls';
import { RecordingLevelMeter } from '../../../composition/audio-recording/dialog/level-meter';

/** Recording settings, transport and take actions remain in separate stable rows. */
export function TimelineRecordingPanel(props: {
  titleId: string;
  startTime: number;
  duration: number;
  captureDuration?: number;
  limitInvalid?: boolean;
  durationOptions?: ReactNode;
  controller: AudioRecordingControllerState;
  device: ReactNode;
  playbackChoice?: ReactNode;
  starting: boolean;
  saving: boolean;
  error: string | null;
  onStart: () => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  onDownload: () => Promise<void>;
  downloading: boolean;
}) {
  const { transport, trim } = props.controller;
  const busy = props.starting || props.saving;
  const recordButton = (
    <ProductActionButton
      tone={trim ? 'secondary' : 'primary'}
      disabled={busy || props.limitInvalid || props.duration <= 0}
      onClick={props.onStart}
    >
      {trim ? <RotateCcw size={16} /> : <Mic size={16} />}
      {translate(trim ? 'videoEditor.app.recordAudioAgain' : 'videoEditor.app.recordAudioStart')}
    </ProductActionButton>
  );
  const context = (
    <div className="min-w-0 text-sm">
      <span id={props.titleId} className="font-medium">
        {translate('videoEditor.app.recordAudioVoiceover')}
      </span>
      <span className="ml-2 inline-block text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
        {formatDurationLabel(props.startTime)}–
        {formatDurationLabel(props.startTime + props.duration)}
      </span>
    </div>
  );
  const closeButton = (
    <ContentToolbarButton
      tone="close"
      title={translate('common.actions.close')}
      disabled={props.saving}
      onClick={props.onClose}
      className="!h-9 !w-9 !min-w-9 !px-0"
    >
      <X size={16} />
    </ContentToolbarButton>
  );
  return (
    <div className="grid min-w-0 gap-3 p-4" data-ui="video-editor.audio-recording.strip">
      <header className="flex min-h-9 items-center gap-3">
        {context}
        <div className="ml-auto shrink-0">{closeButton}</div>
      </header>
      {!trim && (
        <>
          <RecordingSetup
            device={props.device}
            playback={props.playbackChoice}
            duration={props.durationOptions}
          />
          <TimelineRecordingTransport
            transport={transport}
            duration={props.duration}
            captureDuration={props.captureDuration}
            startAction={recordButton}
          />
          <RecordingLevelMeter meter={props.controller.meter} preparing={props.starting} />
        </>
      )}
      {trim && props.limitInvalid ? props.durationOptions : null}
      {renderAudioRecordingTrimPanel(trim, busy, true)}
      {trim && (
        <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
          <AudioRecordingDownloadButton
            disabled={busy || props.downloading}
            onDownload={props.onDownload}
          />
          {recordButton}
          <ProductActionButton tone="primary" disabled={busy} onClick={() => void props.onSave()}>
            <Save size={16} aria-hidden="true" />
            {translate('videoEditor.app.recordAudioInsert')}
          </ProductActionButton>
        </footer>
      )}
      {props.starting && (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.app.recordAudioPreparing')}
        </p>
      )}
      {(props.error || transport.error) && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-danger-text)]">
          {props.error || transport.error}
        </p>
      )}
    </div>
  );
}

function TimelineRecordingTransport(props: {
  transport: AudioRecordingControllerState['transport'];
  duration: number;
  captureDuration?: number | undefined;
  startAction: ReactNode;
}) {
  const recording = props.transport.status === 'recording';
  const paused = props.transport.status === 'paused';
  return (
    <div
      className="flex flex-wrap items-center gap-3 border-t border-[var(--sniptale-color-border-soft)] pt-3"
      role="status"
    >
      <span
        className="inline-flex items-baseline gap-1 whitespace-nowrap text-xs tabular-nums"
        data-ui="video-editor.audio-recording.limit"
      >
        {translate(
          recording || paused
            ? 'videoEditor.app.recordAudioRemaining'
            : 'videoEditor.app.recordAudioLimit'
        )}{' '}
        <strong>
          {formatDurationLabel(
            recording || paused
              ? Math.ceil(
                  Math.max(
                    0,
                    (props.captureDuration ?? props.duration) - props.transport.elapsedSeconds
                  )
                )
              : (props.captureDuration ?? props.duration)
          )}
        </strong>
      </span>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {recording || paused ? (
          <>
            <ProductActionButton
              tone="secondary"
              onClick={() =>
                paused ? void props.transport.resumeRecording() : props.transport.pauseRecording()
              }
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
              {translate(
                paused ? 'videoEditor.app.recordAudioResume' : 'videoEditor.app.recordAudioPause'
              )}
            </ProductActionButton>
            <ProductActionButton tone="secondary" onClick={props.transport.stopRecording}>
              <Square size={16} />
              {translate('videoEditor.app.recordAudioStop')}
            </ProductActionButton>
          </>
        ) : (
          props.startAction
        )}
      </div>
    </div>
  );
}

/** Isolate timeline controls while keeping the video being voiced unobscured. */
export function TimelineRecordingBackdrop() {
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const surface = document.querySelector('[data-ui="video-editor.timeline.surface"]');
    if (!surface) return;
    const update = () => setTop(surface.getBoundingClientRect().top);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(surface);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  return top === null ? null : (
    <div
      aria-hidden="true"
      data-ui="video-editor.audio-recording.timeline-backdrop"
      className={[
        'pointer-events-none fixed inset-x-0 bottom-0 z-[2147483646] backdrop-blur-[2px]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-overlay)_24%,transparent)]',
      ].join(' ')}
      style={{ top }}
    />
  );
}
