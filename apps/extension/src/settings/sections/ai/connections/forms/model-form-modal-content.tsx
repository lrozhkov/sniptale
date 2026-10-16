import { useRef } from 'react';
import { InspectorFieldClear } from '../../../../../ui/compact-inspector-controls/text-field';
import { ModelAudioFields } from './model-audio-fields';
import type {
  AIModelOperation,
  AIModelAudioParameters,
} from '../../../../../contracts/settings/model-operation';
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
    operation?: AIModelOperation;
    audio?: AIModelAudioParameters;
    displayName: string;
    modelCode: string;
    providerId: string;
    systemPrompt: string;
  };
  isEditing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onOperationChange?: (operation: AIModelOperation) => void;
  onAudioChange?: (audio: AIModelAudioParameters) => void;
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
  const name = useRef<HTMLInputElement>(null);
  const code = useRef<HTMLInputElement>(null);
  return (
    <>
      <ProductField
        label={translate('settings.aiProviders.modelNameLabel')}
        error={props.errors['displayName']}
      >
        <div className="sniptale-text-value">
          <ProductInput
            ref={name}
            type="text"
            value={props.formData.displayName}
            onChange={props.onDisplayNameChange}
            placeholder={translate('settings.aiProviders.modelNamePlaceholder')}
            invalid={Boolean(props.errors['displayName'])}
          />
          {props.formData.displayName && (
            <InspectorFieldClear
              label={translate('settings.aiProviders.modelNameLabel')}
              target={name}
            />
          )}
        </div>
      </ProductField>

      <ProductField
        label={translate('settings.aiProviders.modelCodeLabel')}
        error={props.errors['modelCode']}
        hint={translate('settings.aiProviders.modelCodeHint')}
      >
        <div className="sniptale-text-value">
          <ProductInput
            ref={code}
            type="text"
            value={props.formData.modelCode}
            onChange={props.onModelCodeChange}
            placeholder={translate('settings.aiProviders.modelCodePlaceholder')}
            className="font-mono"
            invalid={Boolean(props.errors['modelCode'])}
          />
          {props.formData.modelCode && (
            <InspectorFieldClear
              label={translate('settings.aiProviders.modelCodeLabel')}
              target={code}
            />
          )}
        </div>
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
      <div className="sniptale-text-value">
        <ProductTextarea
          ref={props.textareaRef as React.Ref<HTMLTextAreaElement>}
          value={props.formData.systemPrompt}
          onChange={props.onSystemPromptChange}
          placeholder={translate('settings.aiProviders.modelPromptPlaceholder')}
          rows={3}
          style={{ resize: 'none', marginBottom: 0 }}
          invalid={Boolean(props.errors['systemPrompt'])}
        />
        {props.formData.systemPrompt && (
          <InspectorFieldClear
            label={translate('settings.aiProviders.modelPromptLabel')}
            target={props.textareaRef}
          />
        )}
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
      <ModelAudioFields
        operation={props.formData.operation ?? 'text'}
        audio={props.formData.audio}
        onOperationChange={props.onOperationChange}
        onAudioChange={props.onAudioChange}
        error={props.errors['audio']}
      />
      {(props.formData.operation ?? 'text') === 'text' ? <ModelPromptField {...props} /> : null}
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
