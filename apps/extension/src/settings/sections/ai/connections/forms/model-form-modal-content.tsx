import type React from 'react';
import type { AIProvider } from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductField,
  ProductInput,
  ProductSelect,
  ProductTextarea,
} from '@sniptale/ui/product-form-controls';
import { ProductModal, ProductModalBody, ProductModalHeader } from '@sniptale/ui/product-modal';
import { AiProvidersFormModalLayout } from './layout';
import { AiProvidersFormModalBody } from './shared';
import { settingsModalClassName } from '../../../../section-surface';

type ModelFormModalContentProps = {
  errors: Record<string, string>;
  formData: {
    displayName: string;
    modelCode: string;
    providerId: string;
    systemPrompt: string;
  };
  isEditing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onDisplayNameChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onModelCodeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onProviderChange: (value: string) => void;
  onResizeStart: (event: React.MouseEvent) => void;
  onSubmit: (event: React.FormEvent) => void;
  onSystemPromptChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  providers: AIProvider[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

function MissingProvidersState(props: Pick<ModelFormModalContentProps, 'onClose'>) {
  return (
    <ProductModal
      width="400px"
      maxWidth="calc(100vw - 32px)"
      dialogClassName={settingsModalClassName}
      onClose={props.onClose}
    >
      <ProductModalHeader
        compact
        title={translate('settings.aiProviders.modelModalMissingProvidersTitle')}
        onClose={props.onClose}
      />
      <ProductModalBody compact className="space-y-4">
        <p className="text-sm leading-5 text-[var(--sniptale-color-text-muted)]">
          {translate('settings.aiProviders.modelModalMissingProvidersDescription')}
        </p>
        <ProductActionButton compact onClick={props.onClose} tone="secondary">
          {translate('common.actions.close')}
        </ProductActionButton>
      </ProductModalBody>
    </ProductModal>
  );
}

function ModelProviderField(props: ModelFormModalContentProps) {
  return (
    <ProductField
      label={translate('settings.aiProviders.modelProviderLabel')}
      error={props.errors['providerId']}
    >
      <ProductSelect
        value={props.formData.providerId}
        onChange={props.onProviderChange}
        placeholder={translate('settings.aiProviders.modelProviderPlaceholder')}
        options={props.providers.map((provider) => ({
          value: provider.id,
          label: provider.name,
        }))}
      />
    </ProductField>
  );
}

function ModelIdentityFields(props: ModelFormModalContentProps) {
  return (
    <>
      <ProductField
        label={translate('settings.aiProviders.modelNameLabel')}
        error={props.errors['displayName']}
      >
        <ProductInput
          type="text"
          value={props.formData.displayName}
          onChange={props.onDisplayNameChange}
          placeholder={translate('settings.aiProviders.modelNamePlaceholder')}
          invalid={Boolean(props.errors['displayName'])}
        />
      </ProductField>

      <ProductField
        label={translate('settings.aiProviders.modelCodeLabel')}
        error={props.errors['modelCode']}
        hint={translate('settings.aiProviders.modelCodeHint')}
      >
        <ProductInput
          type="text"
          value={props.formData.modelCode}
          onChange={props.onModelCodeChange}
          placeholder={translate('settings.aiProviders.modelCodePlaceholder')}
          className="font-mono"
          invalid={Boolean(props.errors['modelCode'])}
        />
      </ProductField>
    </>
  );
}

function ModelPromptField(props: ModelFormModalContentProps) {
  return (
    <ProductField
      label={translate('settings.aiProviders.modelPromptLabel')}
      error={props.errors['systemPrompt']}
    >
      <div className="relative">
        <ProductTextarea
          ref={props.textareaRef as React.Ref<HTMLTextAreaElement>}
          value={props.formData.systemPrompt}
          onChange={props.onSystemPromptChange}
          placeholder={translate('settings.aiProviders.modelPromptPlaceholder')}
          rows={3}
          style={{ resize: 'none', marginBottom: 0 }}
          invalid={Boolean(props.errors['systemPrompt'])}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
          onMouseDown={props.onResizeStart}
        />
      </div>
    </ProductField>
  );
}

function ModelFormModalBody(props: ModelFormModalContentProps) {
  return (
    <AiProvidersFormModalBody
      onSubmit={props.onSubmit}
      {...(props.errors['submit'] === undefined ? {} : { submitError: props.errors['submit'] })}
    >
      <ModelProviderField {...props} />
      <ModelIdentityFields {...props} />
      <ModelPromptField {...props} />
    </AiProvidersFormModalBody>
  );
}

export function ModelFormModalContent(props: ModelFormModalContentProps) {
  if (props.providers.length === 0) {
    return <MissingProvidersState onClose={props.onClose} />;
  }

  return (
    <AiProvidersFormModalLayout
      isEditing={props.isEditing}
      isSaving={props.isSaving}
      mode="model"
      onClose={props.onClose}
      onSubmit={props.onSubmit}
    >
      <ModelFormModalBody {...props} />
    </AiProvidersFormModalLayout>
  );
}
