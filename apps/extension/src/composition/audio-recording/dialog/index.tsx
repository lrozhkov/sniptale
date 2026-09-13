import type React from 'react';
import { translate } from '../../../platform/i18n';
import { ProductModal, ProductModalBody, ProductModalFooter } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useAudioRecordingFocus } from '../dialog-focus';
import { useAudioRecordingDialogSession } from './controller';
import {
  AudioRecordingDeviceSelect,
  AudioRecordingModalHeader,
  AudioRecordingSaveButton,
  AudioRecordingTransport,
} from './controls';
import type { AudioRecordingModalProps } from './types';
import { renderAudioRecordingTrimPanel } from './trim';

function AudioRecordingCancelButton({
  onClose,
  disabled,
}: Pick<AudioRecordingModalProps, 'onClose'> & { disabled: boolean }) {
  return (
    <ProductActionButton
      compact
      tone="secondary"
      disabled={disabled}
      onClick={onClose}
      className="px-4"
    >
      {translate('common.actions.cancel')}
    </ProductActionButton>
  );
}

/** Complete shared material recorder; callers own placement and saved-resource attachment. */
export function MaterialAudioRecordingModal(props: AudioRecordingModalProps) {
  const { titleId, handleKeyDown } = useAudioRecordingFocus(props.isOpen);
  const session = useAudioRecordingDialogSession(props);
  if (!props.isOpen) return null;
  return (
    <MaterialRecordingDialog
      session={session}
      titleId={titleId}
      handleKeyDown={handleKeyDown}
      title={props.title}
      saveLabel={props.saveLabel}
      device={
        <AudioRecordingDeviceSelect
          value={session.deviceId}
          onChange={session.setDeviceId}
          disabled={
            session.starting ||
            session.isSaving ||
            session.controller.transport.status === 'recording'
          }
        />
      }
    />
  );
}

function MaterialRecordingDialog({
  session,
  titleId,
  handleKeyDown,
  device,
  title,
  saveLabel,
}: {
  session: ReturnType<typeof useAudioRecordingDialogSession>;
  titleId: string;
  handleKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  device: React.ReactNode;
  title?: string | undefined;
  saveLabel?: string | undefined;
}) {
  const { controller, isSaving, saveError, starting, requestClose, startRecording, saveRecording } =
    session;
  return (
    <ProductModal
      onKeyDown={handleKeyDown}
      onClose={requestClose}
      closeOnBackdrop={false}
      labelledBy={titleId}
      width="min(600px, calc(100vw - 32px))"
      maxHeight="min(760px, calc(100vh - 32px))"
      scrollable
    >
      <AudioRecordingModalHeader
        title={title}
        titleId={titleId}
        onClose={requestClose}
        disabled={isSaving}
      />
      <ProductModalBody compact className="min-h-0 flex-1 overflow-y-auto !gap-2 !py-2">
        {controller.transport.status !== 'recorded' && device}
        <fieldset disabled={isSaving || starting} className="contents">
          <AudioRecordingTransport
            durationLabel={controller.transport.durationLabel}
            error={controller.transport.error}
            onStartRecording={startRecording}
            onStopRecording={controller.transport.stopRecording}
            status={controller.transport.status}
          />
        </fieldset>
        {starting && (
          <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('videoEditor.app.recordAudioPreparing')}
          </p>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-[var(--sniptale-color-danger-text)]">
            {saveError}
          </p>
        )}
        <fieldset disabled={isSaving} className="contents">
          {renderAudioRecordingTrimPanel(controller.trim, isSaving)}
        </fieldset>
      </ProductModalBody>
      <ProductModalFooter compact className="shrink-0 !py-2">
        <AudioRecordingCancelButton disabled={isSaving} onClose={requestClose} />
        <AudioRecordingSaveButton
          destination="materials"
          label={saveLabel}
          audioBlob={controller.save.audioBlob}
          disabled={isSaving}
          onSave={saveRecording}
        />
      </ProductModalFooter>
    </ProductModal>
  );
}
