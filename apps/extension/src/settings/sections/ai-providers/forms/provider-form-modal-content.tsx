import type React from 'react';

import { translate } from '../../../../platform/i18n';
import { ProductField, ProductInput } from '@sniptale/ui/product-form-controls';
import { AiProvidersFormModalLayout } from './layout';
import { AiProvidersFormFieldSurface, AiProvidersFormModalBody } from './shared';

export type ProviderFormModalContentProps = {
  apiKeyInputRef: React.Ref<HTMLInputElement>;
  errors: Record<string, string>;
  formData: {
    baseUrl: string;
    name: string;
  };
  hasStoredApiKey: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onApiKeyChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBaseUrlChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onNameChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent) => void;
};

function ProviderApiKeyField(props: ProviderFormModalContentProps) {
  return (
    <ProductField
      label={[
        translate('settings.aiProviders.providerApiKeyLabel'),
        props.isEditing ? '' : translate('settings.aiProviders.providerApiKeyRequiredSuffix'),
      ].join(' ')}
      error={props.errors['apiKey']}
      hint={
        props.isEditing
          ? props.hasStoredApiKey
            ? translate('settings.aiProviders.providerApiKeyCurrentSet')
            : translate('settings.aiProviders.providerApiKeyReentryHint')
          : undefined
      }
    >
      <ProductInput
        ref={props.apiKeyInputRef}
        type="password"
        defaultValue=""
        onChange={props.onApiKeyChange}
        placeholder={
          props.isEditing
            ? translate('settings.aiProviders.providerApiKeyEditPlaceholder')
            : translate('settings.aiProviders.providerApiKeyCreatePlaceholder')
        }
        autoComplete="new-password"
        className="font-mono"
        invalid={Boolean(props.errors['apiKey'])}
      />
    </ProductField>
  );
}

function ProviderNameField(props: ProviderFormModalContentProps) {
  return (
    <ProductField
      label={translate('settings.aiProviders.providerNameLabel')}
      error={props.errors['name']}
    >
      <ProductInput
        type="text"
        value={props.formData.name}
        onChange={props.onNameChange}
        placeholder={translate('settings.aiProviders.providerNamePlaceholder')}
        invalid={Boolean(props.errors['name'])}
      />
    </ProductField>
  );
}

function ProviderConnectionTypeField() {
  return (
    <ProductField
      label={translate('settings.aiProviders.providerConnectionTypeLabel')}
      hint={translate('settings.aiProviders.providerConnectionTypeHint')}
    >
      <ProductInput
        value={translate('settings.aiProviders.providerConnectionTypeValue')}
        disabled
        readOnly
        aria-readonly
      />
    </ProductField>
  );
}

function ProviderApiUrlField(props: ProviderFormModalContentProps) {
  return (
    <ProductField
      label={translate('settings.aiProviders.providerApiUrlLabel')}
      error={props.errors['baseUrl']}
      hint={translate('settings.aiProviders.providerApiUrlHint')}
    >
      <ProductInput
        type="url"
        value={props.formData.baseUrl}
        onChange={props.onBaseUrlChange}
        placeholder={translate('settings.aiProviders.providerApiUrlPlaceholder')}
        className="font-mono"
        invalid={Boolean(props.errors['baseUrl'])}
      />
    </ProductField>
  );
}

function ProviderFormModalBody(props: ProviderFormModalContentProps) {
  return (
    <AiProvidersFormModalBody
      onSubmit={props.onSubmit}
      {...(props.errors['submit'] === undefined ? {} : { submitError: props.errors['submit'] })}
    >
      <AiProvidersFormFieldSurface>
        <ProviderNameField {...props} />
      </AiProvidersFormFieldSurface>

      <AiProvidersFormFieldSurface>
        <ProviderConnectionTypeField />
      </AiProvidersFormFieldSurface>

      <AiProvidersFormFieldSurface>
        <ProviderApiUrlField {...props} />
      </AiProvidersFormFieldSurface>

      <AiProvidersFormFieldSurface>
        <ProviderApiKeyField {...props} />
      </AiProvidersFormFieldSurface>
    </AiProvidersFormModalBody>
  );
}

export function ProviderFormModalContent(props: ProviderFormModalContentProps) {
  return (
    <AiProvidersFormModalLayout
      isEditing={props.isEditing}
      isSaving={props.isSaving}
      mode="provider"
      onClose={props.onClose}
      onSubmit={props.onSubmit}
    >
      <ProviderFormModalBody {...props} />
    </AiProvidersFormModalLayout>
  );
}
