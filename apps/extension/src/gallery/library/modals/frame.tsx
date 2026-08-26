import type { ReactNode } from 'react';
import { ProductModal, ProductModalBody, ProductModalHeader } from '@sniptale/ui/product-modal';
import { translate } from '../../../platform/i18n';

interface GalleryModalFrameProps {
  title: string;
  description: string;
  maxWidthClassName: string;
  panelClassName?: string;
  onClose: () => void;
  children: ReactNode;
}

export function GalleryModalFrame(props: GalleryModalFrameProps) {
  return (
    <ProductModal
      onClose={props.onClose}
      maxHeight="calc(100vh - 40px)"
      scrollable
      dialogClassName={[props.maxWidthClassName, props.panelClassName].filter(Boolean).join(' ')}
    >
      <ProductModalHeader
        compact
        title={props.title}
        onClose={props.onClose}
        closeTitle={translate('common.actions.close')}
      />
      <ProductModalBody compact className="sniptale-modal-scroll overflow-y-auto">
        <p className="text-sm leading-5 text-[var(--sniptale-color-text-secondary)]">
          {props.description}
        </p>
        {props.children}
      </ProductModalBody>
    </ProductModal>
  );
}
