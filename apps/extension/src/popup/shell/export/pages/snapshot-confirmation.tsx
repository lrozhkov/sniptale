import type { KeyboardEvent } from 'react';

import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../platform/i18n';

export type WebSnapshotDisclosure = {
  body: string;
  requiresConfirmation: boolean;
  title: string;
  warning: string;
};

type WebSnapshotConfirmationDialogProps = {
  disclosure: WebSnapshotDisclosure;
  isSavingPreference: boolean;
  preferenceError: string | null;
  rememberChoice: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onRememberChoiceChange: (rememberChoice: boolean) => void;
};

function WebSnapshotConfirmationBody(props: WebSnapshotConfirmationDialogProps) {
  return (
    <ProductModalBody compact className="gap-3 text-[12px] leading-snug">
      <p className="text-[var(--sniptale-color-text-secondary)]">{props.disclosure.body}</p>
      <p
        className={[
          'rounded-[8px] border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_82%,transparent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-muted)_70%,transparent)] px-3 py-2',
          'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        {props.disclosure.warning}
      </p>
      <label className="flex items-start gap-2 text-[var(--sniptale-color-text-primary)]">
        <input
          type="checkbox"
          checked={props.rememberChoice}
          disabled={props.isSavingPreference}
          onChange={(event) => props.onRememberChoiceChange(event.currentTarget.checked)}
        />
        <span>{translate('popup.export.webSnapshotDisclosureSkipNextTime')}</span>
      </label>
      {props.preferenceError ? (
        <p className="text-[11px] font-semibold text-[var(--sniptale-color-danger)]">
          {props.preferenceError}
        </p>
      ) : null}
    </ProductModalBody>
  );
}

function WebSnapshotConfirmationActions(props: {
  isSavingPreference: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ProductModalFooter compact>
      <ProductActionButton
        compact
        disabled={props.isSavingPreference}
        tone="secondary"
        onClick={props.onCancel}
      >
        {translate('popup.export.webSnapshotDisclosureCancel')}
      </ProductActionButton>
      <ProductActionButton compact disabled={props.isSavingPreference} onClick={props.onConfirm}>
        {translate('popup.export.webSnapshotDisclosureConfirm')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

function useWebSnapshotDialogHandlers(props: {
  isSavingPreference: boolean;
  onCancel: () => void;
}) {
  const handleCancel = () => {
    if (!props.isSavingPreference) {
      props.onCancel();
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') {
      return;
    }

    event.stopPropagation();
    handleCancel();
  };

  return { handleCancel, handleKeyDown };
}

export function WebSnapshotConfirmationDialog({
  disclosure,
  isSavingPreference,
  preferenceError,
  rememberChoice,
  onCancel,
  onConfirm,
  onRememberChoiceChange,
}: WebSnapshotConfirmationDialogProps) {
  const { handleCancel, handleKeyDown } = useWebSnapshotDialogHandlers({
    isSavingPreference,
    onCancel,
  });

  return (
    <ProductModal
      accent="compact"
      closeOnBackdrop={!isSavingPreference}
      labelledBy="web-snapshot-confirmation-title"
      maxWidth="calc(100vw - 24px)"
      onClose={handleCancel}
      onKeyDown={handleKeyDown}
      role="alertdialog"
      width="356px"
    >
      <ProductModalHeader
        compact
        disabled={isSavingPreference}
        onClose={handleCancel}
        title={<span id="web-snapshot-confirmation-title">{disclosure.title}</span>}
      />
      <WebSnapshotConfirmationBody
        disclosure={disclosure}
        isSavingPreference={isSavingPreference}
        onCancel={onCancel}
        onConfirm={onConfirm}
        onRememberChoiceChange={onRememberChoiceChange}
        preferenceError={preferenceError}
        rememberChoice={rememberChoice}
      />
      <WebSnapshotConfirmationActions
        isSavingPreference={isSavingPreference}
        onCancel={handleCancel}
        onConfirm={onConfirm}
      />
    </ProductModal>
  );
}
