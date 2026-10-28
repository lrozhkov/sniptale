import {
  getAIProviderDefinition,
  listAIProviderDefinitions,
  type AIProviderType,
  type AIModelManagement,
} from '../../../../../contracts/settings/ai-provider';
import { useRef, useState } from 'react';
import { InspectorDisclosureView } from '../../../../../ui/compact-inspector-controls/disclosure';
import { InspectorFieldClear } from '../../../../../ui/compact-inspector-controls/text-field';
import type React from 'react';

import { translate } from '../../../../../platform/i18n';
import { ProductField, ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import { AiProvidersFormModalLayout } from './layout';
import { AiProvidersFormModalBody } from './shared';

export type ProviderFormModalContentProps = {
  apiKeyInputRef: React.Ref<HTMLInputElement>;
  errors: Record<string, string>;
  formData: {
    baseUrl: string;
    name: string;
    connectionType: AIProviderType;
    management?: AIModelManagement | undefined;
  };
  hasStoredApiKey: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onApiKeyChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBaseUrlChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onConnectionTypeChange: (value: AIProviderType) => void;
  onManagementChange: (value: AIModelManagement) => void;
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
        aria-label={translate('settings.aiProviders.providerApiKeyLabel')}
        type="password"
        defaultValue=""
        disabled={props.isSaving}
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
  const field = useRef<HTMLInputElement>(null);
  return (
    <ProductField
      label={translate('settings.aiProviders.providerNameLabel')}
      error={props.errors['name']}
    >
      <div className="sniptale-text-value">
        <ProductInput
          ref={field}
          aria-label={translate('settings.aiProviders.providerNameLabel')}
          type="text"
          disabled={props.isSaving}
          value={props.formData.name}
          onChange={props.onNameChange}
          placeholder={translate('settings.aiProviders.providerNamePlaceholder')}
          invalid={Boolean(props.errors['name'])}
        />
        {props.formData.name && (
          <InspectorFieldClear
            label={translate('settings.aiProviders.providerNameLabel')}
            target={field}
          />
        )}
      </div>
    </ProductField>
  );
}

function ProviderApiUrlField(props: ProviderFormModalContentProps) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <ProductField
      label={translate('settings.aiProviders.providerApiUrlLabel')}
      error={props.errors['baseUrl']}
      hint={translate('settings.aiProviders.providerApiUrlHint')}
    >
      <div className="sniptale-text-value">
        <ProductInput
          ref={field}
          aria-label={translate('settings.aiProviders.providerApiUrlLabel')}
          type="url"
          disabled={props.isSaving}
          value={props.formData.baseUrl}
          onChange={props.onBaseUrlChange}
          placeholder={translate('settings.aiProviders.providerApiUrlPlaceholder')}
          className="font-mono"
          invalid={Boolean(props.errors['baseUrl'])}
        />
        {props.formData.baseUrl && (
          <InspectorFieldClear
            label={translate('settings.aiProviders.providerApiUrlLabel')}
            target={field}
          />
        )}
      </div>
    </ProductField>
  );
}

function ProviderApiUrlSettings(props: ProviderFormModalContentProps) {
  const [open, setOpen] = useState(false);
  const definition = getAIProviderDefinition(props.formData.connectionType);
  const [customAddress] = useState(() => props.formData.baseUrl !== definition.baseUrl);
  const required = definition.type === 'openai-compatible' || definition.credential === 'none';
  if (required || customAddress) {
    return <ProviderApiUrlField {...props} />;
  }
  return (
    <InspectorDisclosureView
      dataUi="settings.ai-provider.advanced"
      variant="structural"
      label={translate('settings.aiProviders.providerAdvancedSettings')}
      open={open || Boolean(props.errors['baseUrl'])}
      onOpenChange={setOpen}
      bodyClassName="px-2 pt-2"
    >
      <ProviderApiUrlField {...props} />
    </InspectorDisclosureView>
  );
}

function ProviderFormModalBody(props: ProviderFormModalContentProps) {
  return (
    <AiProvidersFormModalBody
      onSubmit={props.onSubmit}
      {...(props.errors['submit'] === undefined ? {} : { submitError: props.errors['submit'] })}
    >
      <ProductField
        label={translate('settings.aiProviders.providerTypeLabel')}
        error={props.errors['connectionType']}
      >
        <ProductSelect
          aria-label={translate('settings.aiProviders.providerTypeLabel')}
          value={props.formData.connectionType}
          onChange={props.onConnectionTypeChange}
          disabled={props.isSaving}
          options={listAIProviderDefinitions().map((definition) => ({
            value: definition.type,
            label: definition.label,
            disabled: !definition.available || definition.type === 'chrome-built-in',
            ...(definition.type === 'chrome-built-in'
              ? { description: translate('settings.aiProviders.providerChromeSeparate') }
              : !definition.available
                ? { description: translate('settings.aiProviders.providerAdapterUnavailable') }
                : {}),
          }))}
        />
      </ProductField>
      <ProviderNameField {...props} />
      <ProviderApiUrlSettings key={props.formData.connectionType} {...props} />
      {getAIProviderDefinition(props.formData.connectionType).credential !== 'none' && (
        <ProviderApiKeyField {...props} />
      )}
      <ProductField
        label={translate('settings.aiProviders.providerManagementLabel')}
        hint={translate(
          props.formData.management === 'manual'
            ? 'settings.aiProviders.providerManualHint'
            : 'settings.aiProviders.providerAutomaticHint'
        )}
      >
        <ProductSelect
          aria-label={translate('settings.aiProviders.providerManagementLabel')}
          value={props.formData.management ?? 'automatic'}
          onChange={props.onManagementChange}
          disabled={props.isSaving}
          options={[
            { value: 'automatic', label: translate('settings.aiProviders.providerModeAutomatic') },
            { value: 'manual', label: translate('settings.aiProviders.providerModeManual') },
          ]}
        />
      </ProductField>
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
