import React, { useState } from 'react';
import { translate } from '../../../platform/i18n';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { AudioRecordingControllerState } from './controller';
import { useAudioRecordingController } from './controller';
import {
  AudioRecordingModalHeader,
  AudioRecordingSaveButton,
  AudioRecordingTransport,
} from './controls';
import { createRecordedAudioFile, type AudioRecordingModalProps } from './shared';
import { renderAudioRecordingTrimPanel } from './trim';

async function handleAudioRecordingSave(args: {
  save: AudioRecordingControllerState['save'];
  onClose: () => void;
  onSave: AudioRecordingModalProps['onSave'];
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  if (!args.save.audioBlob) {
    return;
  }

  args.setIsSaving(true);
  try {
    await args.onSave(createRecordedAudioFile(args.save.audioBlob), {
      trimEnd: args.save.trimEnd,
      trimStart: args.save.trimStart,
    });
    args.save.resetSession();
    args.onClose();
  } finally {
    args.setIsSaving(false);
  }
}

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
  const controller = useAudioRecordingController(isOpen, onClose);
  const [isSaving, setIsSaving] = useState(false);
  if (!isOpen) {
    return null;
  }

  return (
    <ProductModal
      onClose={onClose}
      closeOnBackdrop
      width="min(720px, calc(100vw - 32px))"
      maxHeight="min(760px, calc(100vh - 32px))"
      scrollable
    >
      <ProductModalHeader title={<AudioRecordingModalHeader />} onClose={onClose} />
      <ProductModalBody className="gap-5">
        <AudioRecordingTransport
          durationLabel={controller.transport.durationLabel}
          error={controller.transport.error}
          onStartRecording={() => void controller.transport.startRecording()}
          onStopRecording={controller.transport.stopRecording}
          status={controller.transport.status}
        />
        {renderAudioRecordingTrimPanel(controller.trim)}
      </ProductModalBody>
      <ProductModalFooter>
        <AudioRecordingCancelButton onClose={onClose} />
        <AudioRecordingSaveButton
          audioBlob={controller.save.audioBlob}
          disabled={isSaving}
          onSave={() =>
            handleAudioRecordingSave({ save: controller.save, onClose, onSave, setIsSaving })
          }
        />
      </ProductModalFooter>
    </ProductModal>
  );
}
