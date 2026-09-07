import React, { useCallback, useEffect, useRef, useState } from 'react';
import { translate } from '../../../platform/i18n';
import { ProductModal, ProductModalBody, ProductModalFooter } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useAudioRecordingFocus } from './focus';
import { useAudioRecordingController } from './controller';
import {
  AudioRecordingModalHeader,
  AudioRecordingSaveButton,
  AudioRecordingTransport,
} from './controls';
import { createRecordedAudioFile, type AudioRecordingModalProps } from './shared';
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
}: AudioRecordingModalProps): React.JSX.Element | null {
  const { titleId, handleKeyDown } = useAudioRecordingFocus(isOpen);
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestClose = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);
  const controller = useAudioRecordingController(isOpen, isSaving);
  useEffect(() => {
    if (isOpen) setSaveError(null);
  }, [isOpen]);
  const saveRecording = async () => {
    if (savingRef.current || !controller.save.audioBlob) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(createRecordedAudioFile(controller.save.audioBlob), {
        trimStart: controller.save.trimStart,
        trimEnd: controller.save.trimEnd,
      });
      controller.save.resetSession();
      onClose();
    } catch {
      setSaveError(translate('common.errors.actionFailed'));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };
  if (!isOpen) {
    return null;
  }

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
      <ProductModalBody compact className="gap-4">
        <fieldset disabled={isSaving} className="contents">
          <AudioRecordingTransport
            durationLabel={controller.transport.durationLabel}
            error={controller.transport.error}
            onStartRecording={() => void controller.transport.startRecording()}
            onStopRecording={controller.transport.stopRecording}
            status={controller.transport.status}
          />
        </fieldset>
        {saveError && (
          <p role="alert" className="text-sm text-[var(--sniptale-color-danger-text)]">
            {saveError}
          </p>
        )}
        <fieldset disabled={isSaving} className="contents">
          {renderAudioRecordingTrimPanel(controller.trim, isSaving)}
        </fieldset>
      </ProductModalBody>
      <ProductModalFooter compact>
        <AudioRecordingCancelButton onClose={requestClose} />
        <AudioRecordingSaveButton
          audioBlob={controller.save.audioBlob}
          disabled={isSaving}
          onSave={saveRecording}
        />
      </ProductModalFooter>
    </ProductModal>
  );
}
