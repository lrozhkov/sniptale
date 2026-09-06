import type React from 'react';
import { ProductModalHeader } from '@sniptale/ui/product-modal';
import { Mic, Save, Square } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { InspectorPanel } from '../../../ui/compact-inspector-controls';
import type { AudioRecordingStatus } from './shared';

export function RecordingActionButton(props: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <ProductActionButton
      tone="secondary"
      disabled={props.disabled}
      onClick={props.onClick}
      className="px-4 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {props.icon}
      {props.label}
    </ProductActionButton>
  );
}

export function AudioRecordingSaveButton(props: {
  audioBlob: Blob | null;
  disabled: boolean;
  onSave: () => Promise<void>;
}) {
  return (
    <ProductActionButton
      tone="primary"
      disabled={props.disabled || !props.audioBlob}
      onClick={() => void props.onSave()}
      className="px-4 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Save size={16} strokeWidth={2.1} />
      {translate('videoEditor.app.recordAudioSave')}
    </ProductActionButton>
  );
}

export function AudioRecordingModalHeader(props: {
  titleId: string;
  onClose: () => void;
  disabled: boolean;
}) {
  return (
    <ProductModalHeader
      compact
      title={<span id={props.titleId}>{translate('videoEditor.app.recordAudioTitle')}</span>}
      onClose={props.onClose}
      disabled={props.disabled}
      closeTitle={translate('common.actions.close')}
    />
  );
}

export function AudioRecordingTransport(props: {
  durationLabel: string;
  error: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  status: AudioRecordingStatus;
}) {
  if (props.status === 'recorded') return <RecordedAudioSummary {...props} />;
  return (
    <>
      <p className="mb-4 text-xs leading-relaxed text-[var(--sniptale-color-text-muted)]">
        {translate('videoEditor.app.recordAudioDescription')}
      </p>
      <InspectorPanel data-ui="video-editor.audio-recording.transport" className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-[var(--sniptale-color-text-muted)]">
              {translate('videoEditor.app.recordAudioDurationLabel')}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--sniptale-color-text-primary)]">
              {props.durationLabel}
            </p>
          </div>
          {props.status === 'recording' ? (
            <RecordingActionButton
              icon={<Square size={16} strokeWidth={2.1} />}
              label={translate('videoEditor.app.recordAudioStop')}
              onClick={props.onStopRecording}
            />
          ) : (
            <RecordingActionButton
              icon={<Mic size={16} strokeWidth={2.1} />}
              label={translate('videoEditor.app.recordAudioStart')}
              onClick={props.onStartRecording}
            />
          )}
        </div>
        {props.error ? (
          <p className="text-sm text-[var(--sniptale-color-danger-text)]">{props.error}</p>
        ) : null}
      </InspectorPanel>
    </>
  );
}

function RecordedAudioSummary(props: {
  durationLabel: string;
  error: string | null;
  onStartRecording: () => void;
}) {
  return (
    <div data-ui="video-editor.audio-recording.transport" className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm tabular-nums text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.app.recordAudioDurationLabel')}: {props.durationLabel}
        </span>
        <RecordingActionButton
          icon={<Mic size={16} />}
          label={translate('videoEditor.app.recordAudioAgain')}
          onClick={props.onStartRecording}
        />
      </div>
      {props.error && (
        <p role="alert" className="text-sm text-[var(--sniptale-color-danger-text)]">
          {props.error}
        </p>
      )}
    </div>
  );
}
