import { translate } from '../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductModal, ProductModalFooter, ProductModalHeader } from '@sniptale/ui/product-modal';

type AiProvidersFormModalLayoutProps = {
  children: React.ReactNode;
  isEditing: boolean;
  isSaving: boolean;
  mode: 'model' | 'provider';
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
};

function handleAiProvidersModalKeyDown(onClose: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };
}

function resolveAiProvidersSubmitLabel(isEditing: boolean, isSaving: boolean) {
  if (isSaving) {
    return `${translate('common.states.saving')}...`;
  }

  return isEditing ? translate('common.actions.save') : translate('common.actions.add');
}

export function AiProvidersFormModalLayout(props: AiProvidersFormModalLayoutProps) {
  return (
    <ProductModal
      width="480px"
      maxHeight="85vh"
      scrollable
      accent="compact"
      onClose={props.onClose}
      onKeyDown={handleAiProvidersModalKeyDown(props.onClose)}
    >
      <ProductModalHeader
        compact
        title={resolveAiProvidersModalTitle(props.mode, props.isEditing)}
        onClose={props.onClose}
        disabled={props.isSaving}
        closeTitle={`${translate('common.actions.close')} (Escape)`}
      />

      {props.children}

      <ProductModalFooter compact>
        <ProductActionButton onClick={props.onClose} tone="secondary" disabled={props.isSaving}>
          {translate('common.actions.cancel')}
        </ProductActionButton>
        <ProductActionButton
          type="submit"
          onClick={props.onSubmit}
          tone="primary"
          disabled={props.isSaving}
        >
          {resolveAiProvidersSubmitLabel(props.isEditing, props.isSaving)}
        </ProductActionButton>
      </ProductModalFooter>
    </ProductModal>
  );
}

function resolveAiProvidersModalTitle(mode: 'model' | 'provider', isEditing: boolean) {
  if (mode === 'provider') {
    return isEditing
      ? translate('settings.aiProviders.providerModalEditTitle')
      : translate('settings.aiProviders.providerModalNewTitle');
  }

  return isEditing
    ? translate('settings.aiProviders.modelModalEditTitle')
    : translate('settings.aiProviders.modelModalNewTitle');
}
