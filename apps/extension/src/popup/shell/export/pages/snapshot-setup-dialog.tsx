import { Archive } from 'lucide-react';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../platform/i18n/popup';

export function WebSnapshotSetupDialog(props: {
  onClose: () => void;
  onOpenSettings: () => void;
  status: 'error' | 'loaded' | 'loading';
}) {
  const title = translate(
    props.status === 'error'
      ? 'popup.export.webSnapshotSetupUnavailableTitle'
      : 'popup.export.webSnapshotSetupTitle'
  );
  const description = translate(
    props.status === 'error'
      ? 'popup.export.webSnapshotSetupUnavailableDescription'
      : 'popup.export.webSnapshotSetupDescription'
  );

  return (
    <ProductModal
      closeOnBackdrop
      labelledBy="web-snapshot-setup-title"
      maxHeight="calc(100vh - 24px)"
      maxWidth="calc(100vw - 24px)"
      onClose={props.onClose}
      role="dialog"
      width="352px"
    >
      <ProductModalHeader
        compact
        onClose={props.onClose}
        title={
          <span className="flex items-center gap-2" id="web-snapshot-setup-title">
            <Archive aria-hidden className="size-4" />
            {title}
          </span>
        }
      />
      <ProductModalBody compact className="gap-2 text-[12px] leading-relaxed">
        <p className="text-[var(--sniptale-color-text-secondary)]">{description}</p>
        <p className="text-[11px] text-[var(--sniptale-color-text-muted)]">
          {translate('popup.export.webSnapshotSetupPrivacyHint')}
        </p>
      </ProductModalBody>
      <ProductModalFooter compact>
        <ProductActionButton compact tone="secondary" onClick={props.onClose}>
          {translate('popup.export.webSnapshotSetupClose')}
        </ProductActionButton>
        <ProductActionButton compact onClick={props.onOpenSettings}>
          {translate('popup.export.webSnapshotSetupOpenSettings')}
        </ProductActionButton>
      </ProductModalFooter>
    </ProductModal>
  );
}
