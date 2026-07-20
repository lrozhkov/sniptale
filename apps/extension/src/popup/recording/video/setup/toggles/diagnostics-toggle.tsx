import { Bug } from 'lucide-react';
import { useState } from 'react';
import { translate } from '../../../../../platform/i18n';
import { PopupIconStateButton } from '../../../../../ui/popup-shell/icon-state-button';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

const DIAGNOSTICS_CONFIRMATION_CLASS_NAME = [
  'col-span-6 mr-1 mt-1.5 rounded-[12px] p-2.5',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_76%,transparent)]',
  'text-[11px] leading-4 text-[var(--sniptale-color-text-secondary)]',
  'shadow-[inset_0_0_0_1px_var(--sniptale-color-border-soft)]',
].join(' ');

const DIAGNOSTICS_CONFIRMATION_ACTION_CLASS_NAME = [
  'mt-2 flex min-w-0 items-center justify-end gap-1.5',
  'text-[11px] font-semibold',
].join(' ');

const DIAGNOSTICS_CONFIRMATION_BUTTON_CLASS_NAME = [
  'rounded-[8px] px-2.5 py-1 transition-colors',
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');

const DIAGNOSTICS_CONFIRMATION_PRIMARY_CLASS_NAME = [
  DIAGNOSTICS_CONFIRMATION_BUTTON_CLASS_NAME,
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_44%,transparent)]',
  'text-[var(--sniptale-color-text-primary-strong)]',
].join(' ');

type VideoDiagnosticsToggleProps = {
  settings: VideoRecordingSettings;
  diagnosticsDisabled: boolean;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
};

export function VideoDiagnosticsToggle({
  settings,
  diagnosticsDisabled,
  onSettingsChange,
}: VideoDiagnosticsToggleProps) {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const description = diagnosticsDisabled
    ? translate('popup.video.diagnosticsUnavailableDescription')
    : translate('popup.video.diagnosticsDescription');
  const label = getDiagnosticsLabel(diagnosticsDisabled);
  const active = !diagnosticsDisabled && settings.diagnosticsEnabled;

  function handleToggle() {
    handleDiagnosticsToggle({ active, onSettingsChange, setConfirmationOpen });
  }

  return (
    <>
      <PopupIconStateButton
        icon={Bug}
        label={label}
        description={description}
        active={active}
        disabled={diagnosticsDisabled}
        onClick={handleToggle}
        accentClassName="text-[var(--sniptale-color-accent)]"
        dataUi="popup.video.diagnostics-toggle"
        geometry="square"
        inactiveDecoration="slash"
      />
      {!diagnosticsDisabled && confirmationOpen && !active ? (
        <VideoDiagnosticsConfirmation
          description={description}
          onCancel={() => setConfirmationOpen(false)}
          onConfirm={() => {
            setConfirmationOpen(false);
            onSettingsChange({ diagnosticsEnabled: true });
          }}
        />
      ) : null}
    </>
  );
}

function getDiagnosticsLabel(diagnosticsDisabled: boolean): string {
  return diagnosticsDisabled
    ? translate('popup.video.diagnosticsUnavailableLabel')
    : translate('popup.video.diagnosticsLabel');
}

function handleDiagnosticsToggle({
  active,
  onSettingsChange,
  setConfirmationOpen,
}: {
  active: boolean;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
  setConfirmationOpen: (open: boolean) => void;
}) {
  if (active) {
    setConfirmationOpen(false);
    onSettingsChange({ diagnosticsEnabled: false });
    return;
  }

  setConfirmationOpen(true);
}

function VideoDiagnosticsConfirmation({
  description,
  onCancel,
  onConfirm,
}: {
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className={DIAGNOSTICS_CONFIRMATION_CLASS_NAME}
      data-ui="popup.video.diagnostics-confirmation"
      role="status"
    >
      {description}
      <div className={DIAGNOSTICS_CONFIRMATION_ACTION_CLASS_NAME}>
        <button
          type="button"
          className={DIAGNOSTICS_CONFIRMATION_BUTTON_CLASS_NAME}
          onClick={onCancel}
        >
          {translate('popup.video.cancelButton')}
        </button>
        <button
          type="button"
          className={DIAGNOSTICS_CONFIRMATION_PRIMARY_CLASS_NAME}
          data-ui="popup.video.diagnostics-confirm"
          onClick={onConfirm}
        >
          {translate('popup.video.diagnosticsEnableAction')}
        </button>
      </div>
    </div>
  );
}
