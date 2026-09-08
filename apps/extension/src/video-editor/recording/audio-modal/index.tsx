import { TimelineRecordingPanel } from './timeline-panel';
import type React from 'react';
import { translate } from '../../../platform/i18n';
import { ProductModal, ProductModalBody, ProductModalFooter } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useAudioRecordingFocus } from './focus';
import { useAudioRecordingDialogSession } from './controller';
import {
  AudioRecordingDeviceSelect,
  AudioRecordingModalHeader,
  AudioRecordingSaveButton,
  AudioRecordingTransport,
} from './controls';
import { type AudioRecordingModalProps } from './shared';
import { renderAudioRecordingTrimPanel } from './trim';

function AudioRecordingCancelButton({ onClose }: Pick<AudioRecordingModalProps, 'onClose'>) {
  return (
    <ProductActionButton tone="secondary" onClick={onClose} className="px-4">
      {translate('common.actions.cancel')}
    </ProductActionButton>
  );
}

export function AudioRecordingModal({
  isOpen,
  onClose,
  onSave,
  timeline,
}: AudioRecordingModalProps): React.JSX.Element | null {
  const { titleId, handleKeyDown } = useAudioRecordingFocus(isOpen);
  const session = useAudioRecordingDialogSession({ isOpen, onClose, onSave, timeline });
  const {
    deviceId,
    setDeviceId,
    controller,
    isSaving,
    saveError,
    starting,
    requestClose,
    startRecording,
    saveRecording,
  } = session;
  const device = (
    <AudioRecordingDeviceSelect
      value={deviceId}
      onChange={setDeviceId}
      disabled={starting || isSaving || controller.transport.status === 'recording'}
    />
  );
  if (!isOpen) return null;
  if (timeline)
    return (
      <ProductModal
        backdropClassName="!bg-[color:color-mix(in_srgb,var(--sniptale-color-overlay)_18%,transparent)]"
        dialogClassName={[
          '!top-auto !bottom-3 !transform-[translate(-50%,0)] !rounded-lg',
          '!bg-[var(--sniptale-color-surface-panel)]',
        ].join(' ')}
        onKeyDown={handleKeyDown}
        onClose={requestClose}
        closeOnBackdrop={false}
        labelledBy={titleId}
        width="min(800px, calc(100vw - 32px))"
        maxHeight="calc(100vh - 24px)"
      >
        <TimelineRecordingPanel
          titleId={titleId}
          startTime={timeline.startTime}
          duration={timeline.duration}
          controller={controller}
          device={device}
          starting={starting}
          saving={isSaving}
          error={saveError}
          onStart={startRecording}
          onClose={requestClose}
          onSave={saveRecording}
        />
      </ProductModal>
    );

  return (
    <MaterialRecordingDialog
      session={session}
      titleId={titleId}
      handleKeyDown={handleKeyDown}
      device={device}
    />
  );
}

function MaterialRecordingDialog({
  session,
  titleId,
  handleKeyDown,
  device,
}: {
  session: ReturnType<typeof useAudioRecordingDialogSession>;
  titleId: string;
  handleKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  device: React.ReactNode;
}) {
  const { controller, isSaving, saveError, starting, requestClose, startRecording, saveRecording } =
    session;
  return (
    <ProductModal
      onKeyDown={handleKeyDown}
      onClose={requestClose}
      closeOnBackdrop={false}
      labelledBy={titleId}
      width="min(720px, calc(100vw - 32px))"
      maxHeight="min(760px, calc(100vh - 32px))"
      scrollable
    >
      <AudioRecordingModalHeader titleId={titleId} onClose={requestClose} disabled={isSaving} />
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
        <AudioRecordingCancelButton onClose={requestClose} />
        <AudioRecordingSaveButton
          destination="materials"
          audioBlob={controller.save.audioBlob}
          disabled={isSaving}
          onSave={saveRecording}
        />
      </ProductModalFooter>
    </ProductModal>
  );
}
