import type { AppLocale } from '../../../platform/i18n';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { getProductPreviewCopy } from '../support/product';

function buildDefaultModalPreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={280}>
      <ProductModal width="100%" maxWidth="none">
        <ProductModalHeader title={copy.modalShellDefaultTitle} />
        <ProductModalBody>
          <div className="text-sm text-[var(--sniptale-color-text-secondary)]">
            {copy.modalShellDefaultBody}
          </div>
        </ProductModalBody>
        <ProductModalFooter>
          <ProductActionButton tone="secondary">{copy.cancel}</ProductActionButton>
          <ProductActionButton tone="primary">{copy.continue}</ProductActionButton>
        </ProductModalFooter>
      </ProductModal>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildCompactModalPreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={220}>
      <ProductModal width="100%" maxWidth="420px" accent="compact">
        <ProductModalHeader title={copy.modalShellCompactTitle} compact />
        <ProductModalBody compact>
          <ProductInput value={copy.modalShellCompactValue} readOnly />
        </ProductModalBody>
        <ProductModalFooter compact>
          <ProductActionButton tone="primary" compact>
            {copy.save}
          </ProductActionButton>
        </ProductModalFooter>
      </ProductModal>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildModalActionsPreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return {
    primary: (
      <DesignSystemFloatingPreviewFrame minHeight={112} className="justify-start">
        <div className="sniptale-ai-modal-root w-full">
          <ProductActionButton tone="primary">{copy.run}</ProductActionButton>
        </div>
      </DesignSystemFloatingPreviewFrame>
    ),
    secondary: (
      <DesignSystemFloatingPreviewFrame minHeight={112} className="justify-start">
        <div className="sniptale-ai-modal-root w-full">
          <ProductActionButton tone="secondary">{copy.cancel}</ProductActionButton>
        </div>
      </DesignSystemFloatingPreviewFrame>
    ),
    danger: (
      <DesignSystemFloatingPreviewFrame minHeight={112} className="justify-start">
        <div className="sniptale-ai-modal-root w-full">
          <ProductActionButton tone="danger">{copy.delete}</ProductActionButton>
        </div>
      </DesignSystemFloatingPreviewFrame>
    ),
    toggle: (
      <DesignSystemFloatingPreviewFrame minHeight={112} className="justify-start">
        <div className="sniptale-ai-modal-root flex w-full gap-2">
          <ProductActionButton tone="toggle" active>
            {copy.grid}
          </ProductActionButton>
          <ProductActionButton tone="toggle">{copy.list}</ProductActionButton>
        </div>
      </DesignSystemFloatingPreviewFrame>
    ),
  };
}

export function buildProductModalPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getProductPreviewCopy(locale);
  const modalActions = buildModalActionsPreview(copy);

  return [
    designSystemPreview('product.ui.modal-shell', 'default', buildDefaultModalPreview(copy)),
    designSystemPreview('product.ui.modal-shell', 'compact', buildCompactModalPreview(copy)),
    designSystemPreview('product.ui.modal-actions', 'primary', modalActions.primary),
    designSystemPreview('product.ui.modal-actions', 'secondary', modalActions.secondary),
    designSystemPreview('product.ui.modal-actions', 'danger', modalActions.danger),
    designSystemPreview('product.ui.modal-actions', 'toggle', modalActions.toggle),
  ];
}
