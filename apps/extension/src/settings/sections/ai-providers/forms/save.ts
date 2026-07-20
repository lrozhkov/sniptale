import type { AIModel, AIProvider } from '../../../../contracts/settings';
import type { AIProviderMutationInput } from '../../../../contracts/messaging/ai-settings-runtime';
import { isAllowedAIProviderBaseUrl } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import {
  addAIModel,
  addAIProvider,
  isAiSettingsMutationError,
  updateAIModel,
  updateAIProvider,
} from '../runtime/settings-mutations';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { ModelFormData, ProviderFormData } from '../../../../features/ai/schemas/ai-settings';
import { mapModelFieldErrors, mapProviderFieldErrors } from './helpers';

const logger = createLogger({ namespace: 'SettingsAiProvidersForm' });

function getProviderApiKeyError(
  isEditing: boolean,
  formData: ProviderFormData,
  provider?: AIProvider | null
): Record<string, string> | null {
  const requiresApiKey = !isEditing || provider?.hasStoredApiKey === false;

  if (!requiresApiKey || formData.apiKey) {
    return null;
  }

  return {
    apiKey:
      isEditing && provider?.hasStoredApiKey === false
        ? translate('settings.aiProviders.providerApiKeyReentryRequired')
        : translate('settings.aiProviders.providerApiKeyRequiredOnCreate'),
  };
}

async function persistProviderForm(args: {
  apiKey: string;
  formData: ProviderFormData;
  isEditing: boolean;
  provider?: AIProvider | null;
}): Promise<void> {
  const nextProvider: AIProviderMutationInput = {
    id: args.provider?.id ?? crypto.randomUUID(),
    name: args.formData.name,
    connectionType: args.formData.connectionType,
    baseUrl: args.formData.baseUrl,
    createdAt: args.provider?.createdAt ?? Date.now(),
    ...(args.apiKey ? { apiKey: args.apiKey } : {}),
  };

  if (args.isEditing && args.provider) {
    await updateAIProvider(nextProvider);
    toast.success(translate('settings.aiProviders.providerUpdated'));
    return;
  }

  await addAIProvider(nextProvider);
  toast.success(translate('settings.aiProviders.providerCreated'));
}

function assertProviderBaseUrlPolicy(baseUrl: string): void {
  if (!isAllowedAIProviderBaseUrl(baseUrl)) {
    throw new Error(translate('settings.aiProviders.providerBaseUrlHttpsRequired'));
  }
}

function buildProviderSaveErrorMessage(): string {
  return `${translate('common.states.error')}${translate('settings.aiProviders.providerSaveErrorSuffix')}`;
}

function buildModelSaveErrorMessage(): string {
  return `${translate('common.states.error')}${translate('settings.aiProviders.modelSaveErrorSuffix')}`;
}

function buildMutationFailureMessage(error: unknown, fallbackMessage: string): string {
  if (isAiSettingsMutationError(error) && error.reason === 'ai-secrets-locked') {
    return translate('settings.aiProviders.providerSaveSecretLocked');
  }

  if (error instanceof Error && error.message.trim()) {
    return `${fallbackMessage}: ${error.message.trim()}`;
  }

  return fallbackMessage;
}

export type ProviderFormSaveParams = {
  formData: ProviderFormData;
  isEditing: boolean;
  onSave: () => void | Promise<void>;
  provider?: AIProvider | null;
  ensureUnlockedBeforeSecretSave?: (() => Promise<void>) | undefined;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
};

export async function saveProviderForm(args: ProviderFormSaveParams): Promise<void> {
  const fieldErrors = mapProviderFieldErrors(args.formData);
  if (fieldErrors) {
    args.setErrors(fieldErrors);
    return;
  }

  const apiKeyError = getProviderApiKeyError(args.isEditing, args.formData, args.provider);
  if (apiKeyError) {
    args.setErrors(apiKeyError);
    return;
  }

  let didStartSave = false;

  try {
    assertProviderBaseUrlPolicy(args.formData.baseUrl);
    if (args.formData.apiKey) {
      await args.ensureUnlockedBeforeSecretSave?.();
    }
    args.setIsSaving(true);
    didStartSave = true;
    await persistProviderForm(
      args.provider === undefined
        ? {
            apiKey: args.formData.apiKey ?? '',
            formData: args.formData,
            isEditing: args.isEditing,
          }
        : {
            apiKey: args.formData.apiKey ?? '',
            formData: args.formData,
            isEditing: args.isEditing,
            provider: args.provider,
          }
    );
    await args.onSave();
  } catch (error) {
    logger.error('Failed to save provider form', error);
    const message = buildMutationFailureMessage(error, buildProviderSaveErrorMessage());
    args.setErrors({ submit: message });
    toast.error(message);
  } finally {
    if (didStartSave) {
      args.setIsSaving(false);
    }
  }
}

async function persistModelForm(args: {
  formData: ModelFormData;
  isEditing: boolean;
  model?: AIModel | null;
}): Promise<void> {
  if (args.isEditing && args.model) {
    await updateAIModel({
      ...args.model,
      providerId: args.formData.providerId,
      displayName: args.formData.displayName,
      modelCode: args.formData.modelCode,
      ...(args.formData.systemPrompt ? { systemPrompt: args.formData.systemPrompt } : {}),
    });
    toast.success(translate('settings.aiProviders.modelUpdated'));
    return;
  }

  await addAIModel({
    id: crypto.randomUUID(),
    providerId: args.formData.providerId,
    displayName: args.formData.displayName,
    modelCode: args.formData.modelCode,
    ...(args.formData.systemPrompt ? { systemPrompt: args.formData.systemPrompt } : {}),
  });
  toast.success(translate('settings.aiProviders.modelCreated'));
}

export type ModelFormSaveParams = {
  formData: ModelFormData;
  isEditing: boolean;
  model?: AIModel | null;
  onSave: () => void | Promise<void>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
};

export async function saveModelForm(args: ModelFormSaveParams): Promise<void> {
  const fieldErrors = mapModelFieldErrors(args.formData);
  if (fieldErrors) {
    args.setErrors(fieldErrors);
    return;
  }

  args.setIsSaving(true);

  try {
    await persistModelForm(
      args.model === undefined
        ? {
            formData: args.formData,
            isEditing: args.isEditing,
          }
        : {
            formData: args.formData,
            isEditing: args.isEditing,
            model: args.model,
          }
    );
    await args.onSave();
  } catch (error) {
    logger.error('Failed to save model form', error);
    const message = buildMutationFailureMessage(error, buildModelSaveErrorMessage());
    args.setErrors({ submit: message });
    toast.error(message);
  } finally {
    args.setIsSaving(false);
  }
}
