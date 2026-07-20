import type React from 'react';
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

export function AudioRecordingModalHeader() {
  return (
    <div>
      <div className="text-lg font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('videoEditor.app.recordAudioTitle')}
      </div>
      <p className="mt-2 max-w-2xl text-sm text-[var(--sniptale-color-text-muted)]">
        {translate('videoEditor.app.recordAudioDescription')}
      </p>
    </div>
  );
}

export function AudioRecordingTransport(props: {
  durationLabel: string;
  error: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  status: AudioRecordingStatus;
}) {
  return (
    <InspectorPanel data-ui="video-editor.audio-recording.transport" className="grid gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sniptale-color-text-muted)]">
            {translate('videoEditor.app.recordAudioDurationLabel')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[var(--sniptale-color-text-primary)]">
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
      {props.status === 'recorded' ? (
        <p className="text-sm text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.app.recordAudioReadyHint')}
        </p>
      ) : null}
      {props.error ? (
        <p className="text-sm text-[var(--sniptale-color-danger-text)]">{props.error}</p>
      ) : null}
    </InspectorPanel>
  );
}
