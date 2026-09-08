import type { ReactNode } from 'react';
import { Mic, RotateCcw, Save, Square, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../platform/i18n';
import type { AudioRecordingControllerState } from './session-types';
import { formatDurationLabel } from './shared';
import { renderAudioRecordingTrimPanel } from './trim';

/** Transport and take review share one compact strip anchored to the recording interval. */
export function TimelineRecordingPanel(props: {
  titleId: string;
  startTime: number;
  duration: number;
  controller: AudioRecordingControllerState;
  device: ReactNode;
  starting: boolean;
  saving: boolean;
  error: string | null;
  onStart: () => void;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const { transport, trim } = props.controller;
  const recording = transport.status === 'recording';
  const busy = props.starting || props.saving;
  const recordButton = (
    <ProductActionButton tone="secondary" disabled={busy} onClick={props.onStart}>
      {trim ? <RotateCcw size={16} /> : <Mic size={16} />}
      {translate(trim ? 'videoEditor.app.recordAudioAgain' : 'videoEditor.app.recordAudioStart')}
    </ProductActionButton>
  );
  const context = (
    <div className="shrink-0 text-xs">
      <span id={props.titleId} className="font-medium">
        {translate('videoEditor.app.recordAudioVoiceover')}
      </span>
      <span className="ml-2 tabular-nums text-[var(--sniptale-color-text-muted)]">
        {formatDurationLabel(props.startTime)}–
        {formatDurationLabel(props.startTime + props.duration)}
      </span>
    </div>
  );
  const closeButton = (
    <ContentToolbarButton
      title={translate('common.actions.close')}
      disabled={props.saving}
      onClick={props.onClose}
      className="!h-9 !w-9 !min-w-9 !px-0"
    >
      <X size={16} />
    </ContentToolbarButton>
  );
  return (
    <div className="grid gap-2 px-3 py-2" data-ui="video-editor.audio-recording.strip">
      {!trim && (
        <div className="flex min-h-9 items-center gap-3">
          {context}
          {!trim && <div className="w-40 min-w-0">{props.device}</div>}
          <span
            className="ml-auto whitespace-nowrap text-xs tabular-nums"
            data-ui="video-editor.audio-recording.limit"
          >
            {translate(
              recording
                ? 'videoEditor.app.recordAudioRemaining'
                : 'videoEditor.app.recordAudioLimit'
            )}{' '}
            <strong>
              {formatDurationLabel(
                recording
                  ? Math.ceil(Math.max(0, props.duration - transport.elapsedSeconds))
                  : props.duration
              )}
            </strong>
          </span>
          {!trim &&
            (recording ? (
              <ProductActionButton tone="secondary" onClick={transport.stopRecording}>
                <Square size={16} />
                {translate('videoEditor.app.recordAudioStop')}
              </ProductActionButton>
            ) : (
              recordButton
            ))}
          {closeButton}
        </div>
      )}
      {renderAudioRecordingTrimPanel(
        trim,
        busy,
        true,
        <>
          {context}
          {recordButton}
          <ProductActionButton tone="secondary" disabled={busy} onClick={() => void props.onSave()}>
            <Save size={16} />
            {translate('videoEditor.app.recordAudioInsert')}
          </ProductActionButton>
          {closeButton}
        </>
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
