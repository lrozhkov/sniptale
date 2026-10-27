import {
  getAIProviderDefinition,
  type AIProviderType,
  type AIModelManagement,
} from '../../../../../contracts/settings/ai-provider';
import type {
  AIModelOperation,
  AIModelAudioParameters,
} from '../../../../../contracts/settings/model-operation';
import type { AIModelCapabilities } from '../../../../../contracts/settings/ai-catalog';
import {
  applyCatalogModelDraft,
  clearModelIdentityClaims,
  createModelDraft,
  getModelCatalogEntries,
  updateDraftCapabilities,
} from './model-draft';
import { useRef, useState } from 'react';
import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import {
  type ModelFormData,
  type ProviderFormData,
} from '../../../../../features/ai/schemas/ai-settings';
import { clearFieldError, createTextareaResizeStartHandler } from './helpers';
import {
  saveModelForm,
  saveProviderForm,
  type ModelFormSaveParams,
  type ModelFormSaveSession,
  type ProviderFormSaveParams,
} from './save';

function buildProviderSaveParams(args: ProviderFormSaveParams) {
  return args.provider === undefined
    ? {
        formData: args.formData,
        ...(args.ensureUnlockedBeforeSecretSave === undefined
          ? {}
          : { ensureUnlockedBeforeSecretSave: args.ensureUnlockedBeforeSecretSave }),
        isEditing: args.isEditing,
        onSave: args.onSave,
        setErrors: args.setErrors,
        setIsSaving: args.setIsSaving,
      }
    : {
        formData: args.formData,
        ...(args.ensureUnlockedBeforeSecretSave === undefined
          ? {}
          : { ensureUnlockedBeforeSecretSave: args.ensureUnlockedBeforeSecretSave }),
        isEditing: args.isEditing,
        onSave: args.onSave,
        provider: args.provider,
        setErrors: args.setErrors,
        setIsSaving: args.setIsSaving,
      };
}

function createInitialProviderFormData(provider?: AIProvider | null): ProviderFormData {
  return {
    name: provider?.name || '',
    connectionType: provider?.connectionType ?? 'openai-compatible',
    management: provider?.management ?? 'automatic',
    enabled: provider?.enabled ?? true,
    baseUrl: provider?.baseUrl || '',
  };
}

async function submitProviderForm(
  params: ProviderFormSaveParams & {
    apiKeyInputRef: React.RefObject<HTMLInputElement | null>;
    ensureUnlockedBeforeSecretSave?: (() => Promise<void>) | undefined;
    event: React.FormEvent;
  }
) {
  params.event.preventDefault();

  await saveProviderForm(
    buildProviderSaveParams({
      formData: {
        ...params.formData,
        apiKey: params.apiKeyInputRef.current?.value ?? '',
      },
      ...(params.ensureUnlockedBeforeSecretSave === undefined
        ? {}
        : { ensureUnlockedBeforeSecretSave: params.ensureUnlockedBeforeSecretSave }),
      isEditing: params.isEditing,
      onSave: params.onSave,
      setErrors: params.setErrors,
      setIsSaving: params.setIsSaving,
      ...(params.provider === undefined ? {} : { provider: params.provider }),
    })
  );
}

function buildProviderSubmitParams(args: {
  apiKeyInputRef: React.RefObject<HTMLInputElement | null>;
  ensureUnlockedBeforeSecretSave?: (() => Promise<void>) | undefined;
  event: React.FormEvent;
  formData: ProviderFormData;
  isEditing: boolean;
  onSave: () => void | Promise<void>;
  provider?: AIProvider | null;
  setErrors: ProviderFormSaveParams['setErrors'];
  setIsSaving: ProviderFormSaveParams['setIsSaving'];
}) {
  return args.provider === undefined
    ? args
    : {
        ...args,
        provider: args.provider,
      };
}

export function useProviderFormState(
  provider?: AIProvider | null,
  ensureUnlockedBeforeSecretSave?: () => Promise<void>
) {
  const [formData, setFormData] = useState<ProviderFormData>(() =>
    createInitialProviderFormData(provider)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(provider);

  const handleChange =
    (field: Exclude<keyof ProviderFormData, 'apiKey'>) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: event.target.value }));
      clearFieldError(errors, setErrors, field);
    };

  const handleConnectionTypeChange = (connectionType: AIProviderType) => {
    if (apiKeyInputRef.current) apiKeyInputRef.current.value = '';
    const definition = getAIProviderDefinition(connectionType);
    setFormData((previous) => ({
      ...previous,
      connectionType,
      baseUrl: definition.baseUrl,
      name:
        !previous.name || previous.name === getAIProviderDefinition(previous.connectionType).label
          ? definition.label
          : previous.name,
    }));
    setErrors({});
  };
  const handleManagementChange = (management: AIModelManagement) =>
    setFormData((previous) => ({ ...previous, management }));

  const handleApiKeyChange = (_event: React.ChangeEvent<HTMLInputElement>) => {
    clearFieldError(errors, setErrors, 'apiKey');
  };

  const handleSubmit = async (event: React.FormEvent, onSave: () => void | Promise<void>) => {
    await submitProviderForm(
      buildProviderSubmitParams({
        apiKeyInputRef,
        ensureUnlockedBeforeSecretSave,
        event,
        formData,
        isEditing,
        onSave,
        ...(provider === undefined ? {} : { provider }),
        setErrors,
        setIsSaving,
      })
    );
  };

  return {
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
  };
}

async function submitModelForm(
  params: ModelFormSaveParams & {
    event: React.FormEvent;
  }
) {
  params.event.preventDefault();

  await saveModelForm({
    session: params.session,
    providerIncarnation: params.providerIncarnation,
    formData: params.formData,
    isEditing: params.isEditing,
    onSave: params.onSave,
    setErrors: params.setErrors,
    setIsSaving: params.setIsSaving,
    ...(params.model === undefined ? {} : { model: params.model }),
  });
}

export function useModelFormState(
  model?: AIModel | null,
  providers: AIProvider[] = [],
  models: AIModel[] = []
) {
  const [saveSession] = useState<ModelFormSaveSession>(() => ({
    modelId: model?.id ?? crypto.randomUUID(),
    pending: false,
  }));
  const [formData, setFormData] = useState<ModelFormData>(() => createModelDraft(model));
  const [entryMode, setEntryMode] = useState<'catalog' | 'manual'>(() =>
    !model || model.propertySource === 'catalog' || model.source === 'catalog'
      ? 'catalog'
      : 'manual'
  );
  const [providerContext, setProviderContext] = useState(() => ({
    id: model?.providerId ?? '',
    incarnation: providers.find((provider) => provider.id === model?.providerId)?.incarnation ?? '',
  }));
  const identityClaims = useRef(Boolean(model));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEditing = Boolean(model);
  const catalogModels = getModelCatalogEntries(models, formData.providerId);
  const catalogModel = catalogModels.find((entry) => entry.modelCode === formData.modelCode);
  const lifecycle =
    catalogModel?.catalog?.lifecycle ??
    (model?.providerId === formData.providerId && model.modelCode === formData.modelCode
      ? model.catalog?.lifecycle
      : undefined);

  const handleChange =
    (field: 'displayName' | 'modelCode' | 'systemPrompt') =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      const clearClaims =
        field === 'modelCode' && identityClaims.current && value !== formData.modelCode;
      if (clearClaims) identityClaims.current = false;
      setFormData((previous) => ({
        ...(clearClaims ? clearModelIdentityClaims(previous) : previous),
        [field]: value,
      }));
      clearFieldError(errors, setErrors, field);
    };
  const handleProviderChange = (value: string) => {
    setProviderContext({
      id: value,
      incarnation: providers.find((provider) => provider.id === value)?.incarnation ?? '',
    });
    const changed = value !== formData.providerId && Boolean(formData.providerId);
    if (changed) identityClaims.current = false;
    setFormData((previous) => ({
      ...(changed ? clearModelIdentityClaims(previous) : previous),
      providerId: value,
    }));
    if (changed) setEntryMode('catalog');
    setErrors({});
  };
  const handleCatalogSelect = (id: string | null) => {
    const selected = catalogModels.find((entry) => entry.id === id);
    if (!selected) return;
    const followsSelectedIdentity = !model && saveSession.committedRecord === undefined;
    if (followsSelectedIdentity) {
      saveSession.modelId = selected.id;
      saveSession.existingRecord = true;
    }
    identityClaims.current = true;
    setFormData((previous) =>
      applyCatalogModelDraft(
        followsSelectedIdentity ? { ...previous, enabled: selected.enabled ?? true } : previous,
        selected
      )
    );
    setEntryMode('catalog');
    setErrors({});
  };
  const handleManualEntry = () => {
    setFormData((previous) => ({ ...previous, propertySource: 'manual' }));
    setEntryMode('manual');
    setErrors({});
  };
  const handleResetFromCatalog = () => {
    if (!catalogModel) return;
    identityClaims.current = true;
    setFormData((previous) => applyCatalogModelDraft(previous, catalogModel));
    setEntryMode('catalog');
    setErrors({});
  };
  const handleCapabilitiesChange = (capabilities: AIModelCapabilities) => {
    setFormData((previous) => updateDraftCapabilities(previous, capabilities));
  };
  const handleOperationChange = (operation: AIModelOperation) => {
    setFormData((previous) => ({ ...previous, operation }));
    clearFieldError(errors, setErrors, 'audio');
  };
  const handleAudioChange = (audio: AIModelAudioParameters) => {
    setFormData((previous) => ({ ...previous, audio: { ...previous.audio, ...audio } }));
    clearFieldError(errors, setErrors, 'audio');
  };
  const handleEnabledChange = (enabled: boolean) =>
    setFormData((previous) => ({ ...previous, enabled }));
  const handleRetirementOverrideChange = (retirementOverride: boolean) =>
    setFormData((previous) => ({
      ...previous,
      retirementOverride,
      ...(!retirementOverride && lifecycle === 'retired' ? { enabled: false } : {}),
    }));
  const handleResizeStart = createTextareaResizeStartHandler(textareaRef);
  const handleSubmit = async (event: React.FormEvent, onSave: () => void | Promise<void>) => {
    await submitModelForm({
      session: saveSession,
      providerIncarnation:
        providerContext.id === formData.providerId ? providerContext.incarnation : '',
      event,
      formData,
      isEditing,
      onSave,
      setErrors,
      setIsSaving,
      ...(model === undefined ? {} : { model }),
    });
  };
  return {
    errors,
    formData,
    entryMode,
    catalogModels,
    catalogModel,
    lifecycle,
    handleChange,
    handleProviderChange,
    handleCatalogSelect,
    handleManualEntry,
    handleResetFromCatalog,
    handleCapabilitiesChange,
    handleEnabledChange,
    handleRetirementOverrideChange,
    handleResizeStart,
    handleOperationChange,
    handleAudioChange,
    handleSubmit,
    isEditing,
    isSaving,
    textareaRef,
  };
}
