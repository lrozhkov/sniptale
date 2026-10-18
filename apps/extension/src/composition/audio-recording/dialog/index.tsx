import { RecordingDiscardConfirmation } from './dismissal';
import type React from 'react';
import { translate } from '../../../platform/i18n';
import { ProductModal, ProductModalBody, ProductModalFooter } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useAudioRecordingFocus } from '../dialog-focus';
import { useAudioRecordingDialogSession } from './controller';
import {
  AudioRecordingDeviceSelect,
  AudioRecordingDownloadButton,
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
  const session = useAudioRecordingDialogSession(props);
  const { titleId, handleKeyDown } = useAudioRecordingFocus(
    props.isOpen,
    session.confirmation.open,
    props.presentation ?? 'modal',
    props.returnFocusTo
  );
  if (!props.isOpen) return null;
  return (
    <MaterialRecordingDialog
      session={session}
      presentation={props.presentation ?? 'modal'}
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
            ['recording', 'paused'].includes(session.controller.transport.status)
          }
        />
      }
    />
  );
}

function MaterialRecordingDialog({
  session,
  presentation,
  titleId,
  handleKeyDown,
  device,
  title,
  saveLabel,
}: {
  session: ReturnType<typeof useAudioRecordingDialogSession>;
  presentation: 'modal' | 'inspector';
  titleId: string;
  handleKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  device: React.ReactNode;
  title?: string | undefined;
  saveLabel?: string | undefined;
}) {
  const { controller, isSaving, saveError, starting, requestClose, startRecording, saveRecording } =
    session;
  return (
    <>
      <RecordingSurface
        presentation={presentation}
        onKeyDown={(event) => {
          handleKeyDown(event);
          if (event.key === 'Escape' && !event.defaultPrevented && !session.confirmation.open) {
            event.preventDefault();
            event.stopPropagation();
            requestClose();
          }
        }}
        onClose={requestClose}
        labelledBy={titleId}
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
              compact={presentation === 'inspector'}
              durationLabel={controller.transport.durationLabel}
              error={controller.transport.error}
              onStartRecording={startRecording}
              onStopRecording={controller.transport.stopRecording}
              onPauseRecording={controller.transport.pauseRecording}
              onResumeRecording={controller.transport.resumeRecording}
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
            {renderAudioRecordingTrimPanel(controller.trim, isSaving, presentation === 'inspector')}
          </fieldset>
        </ProductModalBody>
        <ProductModalFooter
          compact
          className={
            presentation === 'inspector'
              ? 'shrink-0 !flex-wrap !justify-start !gap-2 !p-2'
              : 'shrink-0 !py-2'
          }
        >
          <AudioRecordingCancelButton disabled={isSaving} onClose={requestClose} />
          {controller.save.audioBlob && (
            <AudioRecordingDownloadButton
              iconOnly={presentation === 'inspector'}
              disabled={isSaving || session.isDownloading}
              onDownload={session.downloadTake}
            />
          )}
          <AudioRecordingSaveButton
            destination="materials"
            label={saveLabel}
            audioBlob={controller.save.audioBlob}
            disabled={isSaving}
            onSave={saveRecording}
          />
        </ProductModalFooter>
      </RecordingSurface>
      <RecordingDiscardConfirmation value={session.confirmation} />
    </>
  );
}

/** Presentation changes placement and keyboard containment, never take or commit authority. */
function RecordingSurface(props: {
  presentation: 'modal' | 'inspector';
  labelledBy: string;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (props.presentation === 'inspector')
    return (
      <div
        role="region"
        aria-labelledby={props.labelledBy}
        data-ui="audio-recording.inspector"
        tabIndex={-1}
        className="flex h-full min-h-0 min-w-0 flex-col outline-none"
        onKeyDown={props.onKeyDown}
      >
        {props.children}
      </div>
    );
  return (
    <ProductModal
      onKeyDown={props.onKeyDown}
      onClose={props.onClose}
      closeOnBackdrop={false}
      labelledBy={props.labelledBy}
      width="min(600px, calc(100vw - 32px))"
      maxHeight="min(760px, calc(100vh - 32px))"
      scrollable
    >
      {props.children}
    </ProductModal>
  );
}
