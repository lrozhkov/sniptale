import type { KeyboardEvent } from 'react';
import { Archive, FileCode2, Globe2, Image, ShieldCheck } from 'lucide-react';

import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../platform/i18n/popup';

export type WebSnapshotDisclosure = {
  assetPolicy: 'authenticated' | 'both' | 'error' | 'external' | 'loading' | 'strict';
  body: string;
  requiresConfirmation: boolean;
  title: string;
  warning: string;
};

function SnapshotFeature(props: { icon: typeof FileCode2; label: string; text: string }) {
  const Icon = props.icon;
  return (
    <div className="flex gap-2.5 rounded-[10px] bg-[var(--sniptale-color-surface-muted)] px-3 py-2.5">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--sniptale-color-accent)]" />
      <div className="min-w-0">
        <p className="font-semibold text-[var(--sniptale-color-text-primary)]">{props.label}</p>
        <p className="mt-0.5 text-[11px] text-[var(--sniptale-color-text-secondary)]">
          {props.text}
        </p>
      </div>
    </div>
  );
}

function SnapshotAssetPolicy(props: Pick<WebSnapshotConfirmationDialogProps, 'disclosure'>) {
  const elevated = ['authenticated', 'both', 'error'].includes(props.disclosure.assetPolicy);
  const elevatedClassName = 'border-warning/40 bg-warning/10';
  return (
    <div
      className={[
        'rounded-[10px] border px-3 py-2.5',
        elevated
          ? elevatedClassName
          : 'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 font-semibold text-[var(--sniptale-color-text-primary)]">
        <Globe2 aria-hidden className="size-4" />
        <span>{translate('popup.export.webSnapshotResourcePolicyTitle')}</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--sniptale-color-text-secondary)]">
        {props.disclosure.warning}
      </p>
      <p className="mt-1.5 text-[10px] font-medium text-[var(--sniptale-color-text-secondary)]">
        {translate('popup.export.webSnapshotResourcePolicySettingsHint')}
      </p>
    </div>
  );
}

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
      <div className="grid gap-2">
        <SnapshotFeature
          icon={FileCode2}
          label={translate('popup.export.webSnapshotStaticDocumentTitle')}
          text={translate('popup.export.webSnapshotStaticDocumentDescription')}
        />
        <SnapshotFeature
          icon={Image}
          label={translate('popup.export.webSnapshotScreenshotTitle')}
          text={translate('popup.export.webSnapshotScreenshotDescription')}
        />
        <SnapshotFeature
          icon={ShieldCheck}
          label={translate('popup.export.webSnapshotOfflineTitle')}
          text={translate('popup.export.webSnapshotOfflineDescription')}
        />
      </div>
      <SnapshotAssetPolicy disclosure={props.disclosure} />
      <label className="flex items-start gap-2 rounded-[8px] px-1 py-0.5 text-[var(--sniptale-color-text-primary)]">
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
      closeOnBackdrop={!isSavingPreference}
      labelledBy="web-snapshot-confirmation-title"
      maxWidth="calc(100vw - 24px)"
      onClose={handleCancel}
      onKeyDown={handleKeyDown}
      role="dialog"
      width="380px"
    >
      <ProductModalHeader
        compact
        disabled={isSavingPreference}
        onClose={handleCancel}
        title={
          <span className="flex items-center gap-2" id="web-snapshot-confirmation-title">
            <Archive aria-hidden className="size-4" />
            {disclosure.title}
          </span>
        }
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
