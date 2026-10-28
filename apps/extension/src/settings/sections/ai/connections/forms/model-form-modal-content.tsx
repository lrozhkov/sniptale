import { useRef, useState } from 'react';
import { InspectorDisclosureView } from '../../../../../ui/compact-inspector-controls/disclosure';
import { SettingsSwitch } from '../../../../section-surface/panel-controls';
import { InspectorFieldClear } from '../../../../../ui/compact-inspector-controls/text-field';
import { ModelAudioFields } from './model-audio-fields';
import type {
  AIModelOperation,
  AIModelAudioParameters,
} from '../../../../../contracts/settings/model-operation';
import type React from 'react';
import { AIModelSelector } from '../../../../../features/ai/model-selector';
import { ModelProperties } from './model-properties';
import type { ModelFormData } from '../../../../../features/ai/schemas/ai-settings';
import type {
  AIModelCapabilities,
  AIModelLifecycle,
} from '../../../../../contracts/settings/ai-catalog';
import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import { formatDateTime, getCurrentLocale, translate } from '../../../../../platform/i18n';
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
  formData: ModelFormData;
  catalog: {
    mode: 'catalog' | 'manual';
    models: AIModel[];
    selected?: AIModel | undefined;
    lifecycle?: AIModelLifecycle | undefined;
    retirementAt?: number | undefined;
    onSelect(id: string | null): void;
    onManual(): void;
    onReset(): void;
    onCapabilitiesChange(capabilities: AIModelCapabilities): void;
    onEnabledChange(enabled: boolean): void;
    onRetirementOverrideChange(allowed: boolean): void;
    onRefreshConnections?: (() => void) | undefined;
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
          value={props.formData.systemPrompt ?? ''}
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

function ModelCatalogFields(props: ModelFormModalContentProps) {
  const selected = props.catalog.selected;
  return (
    <>
      <ProductField
        label={translate('settings.aiProviders.modelCatalogTitle')}
        error={props.errors['modelCode'] ?? props.errors['displayName']}
      >
        {props.catalog.models.length > 0 ? (
          <AIModelSelector
            portalMenu
            models={props.catalog.models}
            providers={props.providers}
            selectedModelId={selected?.id ?? null}
            onSelect={props.catalog.onSelect}
            disabled={props.isSaving}
          />
        ) : (
          <p className="text-[13px] leading-[18px] text-[var(--sniptale-color-text-muted)]">
            {translate('settings.aiProviders.modelCatalogEmpty')}
          </p>
        )}
      </ProductField>
      <ProductActionButton compact tone="secondary" onClick={props.catalog.onManual}>
        {translate(
          selected
            ? 'settings.aiProviders.modelConfigureManually'
            : 'settings.aiProviders.modelManualEntry'
        )}
      </ProductActionButton>
      {selected && props.formData.propertySource === 'catalog' ? (
        <>
          <p className="text-[13px] leading-[18px] text-[var(--sniptale-color-text-muted)]">
            {translate('settings.aiProviders.modelCatalogPreview')}
          </p>
          <dl className="space-y-1 text-[13px] leading-[18px]">
            <div className="grid min-h-7 grid-cols-[100px_minmax(0,1fr)] gap-2">
              <dt className="text-[var(--sniptale-color-text-muted)]">
                {translate('settings.aiProviders.modelNameProperty')}
              </dt>
              <dd className="m-0 break-words">{props.formData.displayName}</dd>
            </div>
            <div className="grid min-h-7 grid-cols-[100px_minmax(0,1fr)] gap-2">
              <dt className="text-[var(--sniptale-color-text-muted)]">
                {translate('settings.aiProviders.modelCodeProperty')}
              </dt>
              <dd className="m-0 break-all font-mono">{props.formData.modelCode}</dd>
            </div>
          </dl>
          <ModelLifecycleFields {...props} />
          {props.formData.capabilities ? (
            <ModelProperties capabilities={props.formData.capabilities} />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function ModelLifecycleFields(props: ModelFormModalContentProps) {
  const retired = props.catalog.lifecycle === 'retired';
  const manuallyOwned =
    props.catalog.mode === 'manual' && props.formData.propertySource === 'manual';
  const canEnable = !retired || (manuallyOwned && props.formData.retirementOverride === true);
  const statuses = {
    active: 'settings.aiProviders.modelLifecycleActive',
    deprecated: 'settings.aiProviders.modelLifecycleDeprecated',
    retired: 'settings.aiProviders.modelLifecycleRetired',
    absent: 'settings.aiProviders.modelLifecycleUnknown',
    unknown: 'settings.aiProviders.modelLifecycleUnknown',
  } as const;
  return (
    <>
      {props.catalog.lifecycle ? (
        <dl className="text-[13px] leading-[18px]">
          <div className="grid min-h-7 grid-cols-2 gap-2">
            <dt className="text-[var(--sniptale-color-text-muted)]">
              {translate('settings.aiProviders.modelLifecycleLabel')}
            </dt>
            <dd className="m-0 text-right">{translate(statuses[props.catalog.lifecycle])}</dd>
          </div>
          {props.catalog.retirementAt !== undefined ? (
            <div className="grid min-h-7 grid-cols-2 gap-2">
              <dt className="text-[var(--sniptale-color-text-muted)]">
                {translate('settings.aiProviders.modelRetirementDate')}
              </dt>
              <dd className="m-0 text-right">
                <time dateTime={new Date(props.catalog.retirementAt).toISOString()}>
                  {formatDateTime(
                    props.catalog.retirementAt,
                    { dateStyle: 'short', timeStyle: 'short' },
                    getCurrentLocale()
                  )}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {retired ? (
        <p className="text-[13px] leading-[18px] text-[var(--sniptale-color-text-muted)]">
          {translate('settings.aiProviders.modelRetiredHint')}
        </p>
      ) : null}
      {retired && manuallyOwned ? (
        <div className="flex items-center justify-between gap-2 text-[13px] leading-[18px]">
          <span>{translate('settings.aiProviders.modelRetirementOverride')}</span>
          <SettingsSwitch
            checked={props.formData.retirementOverride === true}
            aria-label={translate('settings.aiProviders.modelRetirementOverride')}
            onClick={() =>
              props.catalog.onRetirementOverrideChange(props.formData.retirementOverride !== true)
            }
          />
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 text-[13px] leading-[18px]">
        <span>{translate('settings.aiProviders.modelEnabledLabel')}</span>
        <SettingsSwitch
          checked={canEnable && props.formData.enabled !== false}
          disabled={!canEnable}
          aria-label={translate('settings.aiProviders.modelEnabledLabel')}
          onClick={() => props.catalog.onEnabledChange(props.formData.enabled === false)}
        />
      </div>
    </>
  );
}

function ModelFormModalBody(props: ModelFormModalContentProps) {
  const manual = props.catalog.mode === 'manual';
  const [parametersOpen, setParametersOpen] = useState(manual);
  const hasModel = manual || Boolean(props.catalog.selected);
  const availableOperations = props.formData.capabilities
    ? (['text', 'transcription', 'speech'] as const).filter(
        (operation) => props.formData.capabilities?.operations[operation] === 'supported'
      )
    : undefined;
  const operation = availableOperations?.includes(props.formData.operation ?? 'text')
    ? (props.formData.operation ?? 'text')
    : (availableOperations?.[0] ?? props.formData.operation ?? 'text');
  return (
    <AiProvidersFormModalBody
      onSubmit={props.onSubmit}
      {...(props.errors['submit'] === undefined ? {} : { submitError: props.errors['submit'] })}
    >
      <fieldset disabled={props.isSaving} className="m-0 min-w-0 space-y-3 border-0 p-0">
        <ModelProviderField {...props} />
        {props.errors['submit'] && props.catalog.onRefreshConnections ? (
          <ProductActionButton
            compact
            tone="secondary"
            onClick={props.catalog.onRefreshConnections}
          >
            {translate('settings.aiProviders.modelRefreshConnections')}
          </ProductActionButton>
        ) : null}
        {manual ? (
          <>
            <ModelIdentityFields {...props} />
            {props.formData.capabilities ? (
              <ModelProperties
                capabilities={props.formData.capabilities}
                onChange={props.catalog.onCapabilitiesChange}
              />
            ) : null}
            <ProductActionButton
              compact
              tone="secondary"
              disabled={!props.catalog.selected}
              onClick={props.catalog.onReset}
            >
              {translate('settings.aiProviders.modelResetCatalog')}
            </ProductActionButton>
            {!props.catalog.selected ? (
              <p className="text-[13px] leading-[18px] text-[var(--sniptale-color-text-muted)]">
                {translate('settings.aiProviders.modelResetUnavailable')}
              </p>
            ) : null}
          </>
        ) : (
          <ModelCatalogFields {...props} />
        )}
        {hasModel ? (
          <>
            {manual ? <ModelLifecycleFields {...props} /> : null}
            {availableOperations === undefined || availableOperations.length > 0 ? (
              <InspectorDisclosureView
                dataUi="settings.ai-model.parameters"
                variant="structural"
                label={translate('settings.aiProviders.modelAudioParameters')}
                open={parametersOpen}
                onOpenChange={setParametersOpen}
                bodyClassName="space-y-3 px-2 pt-2"
              >
                <ModelAudioFields
                  operation={operation}
                  audio={props.formData.audio}
                  onOperationChange={props.onOperationChange}
                  onAudioChange={props.onAudioChange}
                  error={props.errors['audio']}
                  {...(availableOperations === undefined ? {} : { availableOperations })}
                />
                {operation === 'text' ? <ModelPromptField {...props} /> : null}
              </InspectorDisclosureView>
            ) : null}
          </>
        ) : null}
      </fieldset>
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
      <ModelFormModalBody key={props.catalog.mode} {...props} />
    </AiProvidersFormModalLayout>
  );
}
