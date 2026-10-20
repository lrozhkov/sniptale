import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { ProductModal } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../platform/i18n/popup';
import { persistVideoSettings } from '../../persistence';
import type { VideoSetupPageProps } from './types';

type StartConfirmationProps = Pick<
  VideoSetupPageProps,
  'settings' | 'recordingState' | 'activeRecordingId' | 'onSettingsChange' | 'onStart'
> & { canStart: boolean };

export function useVideoStartConfirmation(props: StartConfirmationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);
  const attemptRef = useRef(0);
  const pendingRef = useRef(false);
  const latestRef = useRef(props);
  latestRef.current = props;

  const cancel = useCallback(() => {
    attemptRef.current += 1;
    pendingRef.current = false;
    setIsOpen(false);
    setIsSaving(false);
    setRememberChoice(false);
    setHasSaveError(false);
  }, []);

  useLayoutEffect(() => {
    setIsOpen(false);
    setIsSaving(false);
    setRememberChoice(false);
    setHasSaveError(false);
    return () => {
      attemptRef.current += 1;
      pendingRef.current = false;
    };
  }, [
    props.activeRecordingId,
    props.canStart,
    props.recordingState.status,
    props.settings.microphoneEnabled,
    props.settings.warnWithoutMicrophone,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, cancel]);

  const start = () => {
    if (!canStartRecording(latestRef.current)) {
      return;
    }
    if (
      !latestRef.current.settings.microphoneEnabled &&
      latestRef.current.settings.warnWithoutMicrophone !== false
    ) {
      setIsOpen(true);
      return;
    }
    latestRef.current.onStart();
  };

  const continueRecording = async () => {
    if (!isOpen || pendingRef.current || !canStartRecording(latestRef.current)) {
      return;
    }
    pendingRef.current = true;
    const attempt = ++attemptRef.current;
    setHasSaveError(false);
    if (rememberChoice) {
      setIsSaving(true);
      try {
        await persistVideoSettings({ warnWithoutMicrophone: false });
      } catch {
        if (attemptRef.current === attempt) {
          pendingRef.current = false;
          setIsSaving(false);
          setHasSaveError(true);
        }
        return;
      }
    }
    if (attemptRef.current !== attempt || !canStartRecording(latestRef.current)) {
      return;
    }
    if (rememberChoice) {
      latestRef.current.onSettingsChange({ warnWithoutMicrophone: false });
    }
    setIsOpen(false);
    setIsSaving(false);
    if (canStartRecording(latestRef.current)) {
      latestRef.current.onStart();
    }
  };

  return {
    start,
    confirmation: isOpen ? (
      <VideoStartConfirmation
        rememberChoice={rememberChoice}
        onRememberChoiceChange={setRememberChoice}
        isSaving={isSaving}
        hasSaveError={hasSaveError}
        onCancel={cancel}
        onContinue={() => void continueRecording()}
      />
    ) : null,
  };
}

function canStartRecording(props: StartConfirmationProps) {
  return props.canStart && props.recordingState.status === VideoRecordingStatus.IDLE;
}

function containConfirmationTab(event: ReactKeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const controls = event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled])'
  );
  const first = controls[0];
  const last = controls[controls.length - 1];
  const active = event.currentTarget.ownerDocument.activeElement;
  const target =
    event.shiftKey && active === first ? last : !event.shiftKey && active === last ? first : null;
  if (target) {
    event.preventDefault();
    target.focus({ preventScroll: true });
  }
}

function VideoStartConfirmation({
  rememberChoice,
  onRememberChoiceChange,
  isSaving,
  hasSaveError,
  onCancel,
  onContinue,
}: {
  rememberChoice: boolean;
  onRememberChoiceChange: (value: boolean) => void;
  isSaving: boolean;
  hasSaveError: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    dialog?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-label={translate('popup.video.withoutMicrophoneTitle')}
      aria-busy={isSaving}
      tabIndex={-1}
      onKeyDown={containConfirmationTab}
      className={[
        'm-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0',
        'text-[var(--sniptale-color-text-primary)] outline-none backdrop:bg-transparent',
      ].join(' ')}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <ProductModal
        role="presentation"
        onClose={onCancel}
        width="calc(100vw - 32px)"
        maxWidth="360px"
        maxHeight="calc(100dvh - 32px)"
        scrollable
        backdropClassName="backdrop-blur-[2px]"
        dialogClassName="sniptale-ai-modal-adopted"
      >
        <div className="flex flex-col gap-3 p-4">
          <p className="m-0 text-[13px] leading-5 text-[var(--sniptale-color-text-primary)]">
            {translate('popup.video.withoutMicrophoneTitle')}
          </p>
          {hasSaveError ? (
            <p role="alert" className="select-text text-xs text-[var(--sniptale-color-danger)]">
              {translate('popup.video.withoutMicrophoneSaveError')}
            </p>
          ) : null}
          <div
            className="flex items-center justify-between gap-2"
            data-ui="popup.video.without-microphone-actions"
          >
            <label
              className={[
                'flex min-h-8 cursor-pointer select-none items-center gap-2 text-xs',
                'text-[var(--sniptale-color-text-secondary)]',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={rememberChoice}
                disabled={isSaving}
                onChange={(event) => onRememberChoiceChange(event.target.checked)}
                className={[
                  'sniptale-checkbox rounded-full! focus:outline-none',
                  'focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-[var(--sniptale-color-accent)]',
                ].join(' ')}
              />
              {translate('popup.video.withoutMicrophoneRemember')}
            </label>
            <div className="flex shrink-0 items-center gap-1">
              <ProductActionButton
                compact
                tone="secondary"
                className="h-8! min-h-8! px-3! text-xs"
                onClick={onCancel}
              >
                {translate('popup.video.withoutMicrophoneCancel')}
              </ProductActionButton>
              <ProductActionButton
                compact
                tone="primary"
                className="h-8! min-h-8! px-3! text-xs"
                disabled={isSaving}
                onClick={onContinue}
              >
                {translate('popup.video.withoutMicrophoneContinue')}
              </ProductActionButton>
            </div>
          </div>
        </div>
      </ProductModal>
    </dialog>
  );
}
