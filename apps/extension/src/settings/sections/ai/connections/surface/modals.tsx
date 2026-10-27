import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { ModelFormModalContent } from '../forms/model-form-modal-content';
import { ProviderFormModalContent } from '../forms/provider-form-modal-content';
import { useModelFormState, useProviderFormState } from '../forms/hooks';
import type { AiProvidersSectionState } from '../controller/types';
import { getAiProviderDeleteMessage } from './helpers';

interface ProviderModalProps {
  ensureUnlockedBeforeSecretSave?: (() => Promise<void>) | undefined;
  provider?: AIProvider | null;
  onClose: () => void;
  onSave: () => void | Promise<void>;
}

export function ProviderFormModal({
  ensureUnlockedBeforeSecretSave,
  provider,
  onClose,
  onSave,
}: ProviderModalProps) {
  const {
    apiKeyInputRef,
    errors,
    formData,
    handleApiKeyChange,
    handleConnectionTypeChange,
    handleManagementChange,
    handleChange,
    handleSubmit,
    isEditing,
    isSaving,
  } = useProviderFormState(provider, ensureUnlockedBeforeSecretSave);

  return (
    <ProviderFormModalContent
      apiKeyInputRef={apiKeyInputRef}
      errors={errors}
      formData={formData}
      hasStoredApiKey={provider?.hasStoredApiKey ?? false}
      isEditing={isEditing}
      isSaving={isSaving}
      onApiKeyChange={handleApiKeyChange}
      onConnectionTypeChange={handleConnectionTypeChange}
      onManagementChange={handleManagementChange}
      onBaseUrlChange={handleChange('baseUrl')}
      onClose={onClose}
      onNameChange={handleChange('name')}
      onSubmit={(event) => void handleSubmit(event, onSave)}
    />
  );
}

interface ModelModalProps {
  model?: AIModel | null;
  providers: AIProvider[];
  catalogModels?: AIModel[];
  onReloadProviders?: (() => Promise<void>) | undefined;
  onClose: () => void;
  onSave: () => void | Promise<void>;
}

export function ModelFormModal({
  model,
  providers,
  catalogModels = [],
  onReloadProviders,
  onClose,
  onSave,
}: ModelModalProps) {
  const {
    errors,
    formData,
    handleChange,
    handleProviderChange,
    handleResizeStart,
    handleOperationChange,
    handleAudioChange,
    handleSubmit,
    isEditing,
    isSaving,
    textareaRef,
    entryMode,
    catalogModels: availableCatalog,
    catalogModel,
    lifecycle,
    handleCatalogSelect,
    handleManualEntry,
    handleResetFromCatalog,
    handleCapabilitiesChange,
    handleEnabledChange,
    handleRetirementOverrideChange,
  } = useModelFormState(model, providers, catalogModels);

  return (
    <ModelFormModalContent
      errors={errors}
      formData={formData}
      catalog={{
        mode: entryMode,
        models: availableCatalog,
        selected: catalogModel,
        lifecycle,
        onSelect: handleCatalogSelect,
        onManual: handleManualEntry,
        onReset: handleResetFromCatalog,
        onCapabilitiesChange: handleCapabilitiesChange,
        onEnabledChange: handleEnabledChange,
        onRetirementOverrideChange: handleRetirementOverrideChange,
        ...(onReloadProviders
          ? { onRefreshConnections: () => void onReloadProviders().catch(() => undefined) }
          : {}),
      }}
      isEditing={isEditing}
      isSaving={isSaving}
      onClose={onClose}
      onDisplayNameChange={handleChange('displayName')}
      onModelCodeChange={handleChange('modelCode')}
      onProviderChange={handleProviderChange}
      onResizeStart={handleResizeStart}
      onOperationChange={handleOperationChange}
      onAudioChange={handleAudioChange}
      onSubmit={(event) => void handleSubmit(event, onSave)}
      onSystemPromptChange={handleChange('systemPrompt')}
      providers={providers}
      textareaRef={textareaRef}
    />
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <ProductConfirmDialog
      title={title}
      message={message}
      cancelText={translate('common.actions.cancel')}
      confirmText={translate('common.actions.delete')}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function AIProvidersSectionModals(props: { state: AiProvidersSectionState }) {
  const { modals } = props.state;

  return (
    <>
      {modals.provider.open ? (
        <ProviderFormModal
          onClose={modals.closeProviderModal}
          onSave={async () => {
            await props.state.reloadData();
            modals.closeProviderModal();
          }}
          {...(modals.provider.provider === undefined
            ? {}
            : { provider: modals.provider.provider })}
          ensureUnlockedBeforeSecretSave={props.state.secretProtection.ensureUnlocked}
        />
      ) : null}

      {modals.model.open ? (
        <ModelFormModal
          providers={props.state.providers}
          catalogModels={props.state.catalogModels}
          onReloadProviders={props.state.reloadData}
          onClose={modals.closeModelModal}
          onSave={async () => {
            await props.state.reloadData();
            modals.closeModelModal();
          }}
          {...(modals.model.model === undefined ? {} : { model: modals.model.model })}
        />
      ) : null}

      {modals.confirmDelete ? (
        <ConfirmDialog
          title={
            modals.confirmDelete.type === 'provider'
              ? translate('settings.aiProviders.deleteProviderTitle')
              : translate('settings.aiProviders.deleteModelTitle')
          }
          message={getAiProviderDeleteMessage(modals.confirmDelete)}
          onConfirm={
            modals.confirmDelete.type === 'provider'
              ? props.state.catalogActions.deleteProvider
              : props.state.catalogActions.deleteModel
          }
          onCancel={() => modals.setConfirmDelete(null)}
        />
      ) : null}
    </>
  );
}
