import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../platform/i18n/popup';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';
import { actionFooterSurfaceClassName } from '../../../../ui/popup-shell/action-footer/tokens';
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
  return (
    <section className={actionFooterSurfaceClassName} aria-busy={isSaving}>
      <p className="px-2 py-1 text-xs text-[var(--sniptale-color-text-primary)]">
        {translate('popup.video.withoutMicrophoneTitle')}
      </p>
      <label
        className={[
          'flex min-h-8 cursor-pointer select-none items-center gap-2 px-2 text-xs',
          'text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        <input
          type="checkbox"
          checked={rememberChoice}
          disabled={isSaving}
          onChange={(event) => onRememberChoiceChange(event.target.checked)}
          className={[
            'accent-[var(--sniptale-color-accent)] focus:outline-none',
            'focus-visible:outline focus-visible:outline-2',
            'focus-visible:outline-[var(--sniptale-color-accent)]',
          ].join(' ')}
        />
        {translate('popup.video.withoutMicrophoneRemember')}
      </label>
      {hasSaveError ? (
        <p
          role="alert"
          className="select-text px-2 pb-2 text-xs text-[var(--sniptale-color-danger)]"
        >
          {translate('popup.video.withoutMicrophoneSaveError')}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-1.5">
        <PopupActionButton
          icon={X}
          iconClassName="text-[var(--sniptale-color-text-secondary)]"
          label={translate('popup.video.withoutMicrophoneCancel')}
          onClick={onCancel}
        />
        <PopupActionButton
          icon={Check}
          iconClassName="text-[var(--sniptale-color-text-secondary)]"
          label={translate('popup.video.withoutMicrophoneContinue')}
          tone="primary"
          disabled={isSaving}
          onClick={onContinue}
        />
      </div>
    </section>
  );
}
