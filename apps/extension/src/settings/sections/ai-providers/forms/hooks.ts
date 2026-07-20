import { useRef, useState } from 'react';
import type { AIModel, AIProvider } from '../../../../contracts/settings';
import {
  type ModelFormData,
  type ProviderFormData,
} from '../../../../features/ai/schemas/ai-settings';
import { clearFieldError, createTextareaResizeStartHandler } from './helpers';
import {
  saveModelForm,
  saveProviderForm,
  type ModelFormSaveParams,
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
    connectionType: 'openai-compatible',
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
    formData: params.formData,
    isEditing: params.isEditing,
    onSave: params.onSave,
    setErrors: params.setErrors,
    setIsSaving: params.setIsSaving,
    ...(params.model === undefined ? {} : { model: params.model }),
  });
}

export function useModelFormState(model?: AIModel | null) {
  const [formData, setFormData] = useState<ModelFormData>({
    providerId: model?.providerId || '',
    displayName: model?.displayName || '',
    modelCode: model?.modelCode || '',
    systemPrompt: model?.systemPrompt || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEditing = Boolean(model);

  const handleChange =
    (field: keyof ModelFormData) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData((prev) => ({ ...prev, [field]: event.target.value }));
      clearFieldError(errors, setErrors, field);
    };

  const handleProviderChange = (value: string) => {
    setFormData((prev) => ({ ...prev, providerId: value }));
    clearFieldError(errors, setErrors, 'providerId');
  };

  const handleResizeStart = createTextareaResizeStartHandler(textareaRef);

  const handleSubmit = async (event: React.FormEvent, onSave: () => void | Promise<void>) => {
    await submitModelForm(
      model === undefined
        ? { event, formData, isEditing, onSave, setErrors, setIsSaving }
        : { event, formData, isEditing, model, onSave, setErrors, setIsSaving }
    );
  };

  return {
    errors,
    formData,
    handleChange,
    handleProviderChange,
    handleResizeStart,
    handleSubmit,
    isEditing,
    isSaving,
    textareaRef,
  };
}
