import {
  ModelFormSchema,
  ProviderFormSchema,
  type ModelFormData,
  type ProviderFormData,
} from '../../../../features/ai/schemas/ai-settings';
import { translate } from '../../../../platform/i18n';

const PROVIDER_FORM_ERROR_KEYS: Record<string, Parameters<typeof translate>[0]> = {
  'validation.schemas.httpsUrlRequired': 'settings.aiProviders.providerBaseUrlHttpsRequired',
  'validation.schemas.invalidUrl': 'settings.aiProviders.providerBaseUrlInvalid',
  'validation.schemas.max100Characters': 'settings.aiProviders.providerNameTooLong',
  'validation.schemas.nameRequired': 'settings.aiProviders.providerNameRequired',
};

const MODEL_FORM_ERROR_KEYS: Record<string, Parameters<typeof translate>[0]> = {
  'validation.schemas.max10000Characters': 'settings.aiProviders.modelPromptTooLong',
  'validation.schemas.max100Characters': 'settings.aiProviders.modelNameTooLong',
  'validation.schemas.max200Characters': 'settings.aiProviders.modelCodeTooLong',
  'validation.schemas.modelCodeRequired': 'settings.aiProviders.modelCodeRequired',
  'validation.schemas.nameRequired': 'settings.aiProviders.modelNameRequired',
  'validation.schemas.selectProvider': 'settings.aiProviders.modelProviderRequired',
};

function translateMappedFieldError(
  message: string,
  mapping: Record<string, Parameters<typeof translate>[0]>
) {
  const translationKey = mapping[message];
  return translationKey ? translate(translationKey) : message;
}

function collectFirstFieldErrors(
  issues: Array<{ message: string; path: PropertyKey[] }>,
  mapping: Record<string, Parameters<typeof translate>[0]>
) {
  const fieldErrors: Record<string, string> = {};

  issues.forEach((issue) => {
    const field = issue.path[0];

    if (typeof field !== 'string' || fieldErrors[field]) {
      return;
    }

    fieldErrors[field] = translateMappedFieldError(issue.message, mapping);
  });

  return fieldErrors;
}

export function mapProviderFieldErrors(formData: ProviderFormData) {
  const result = ProviderFormSchema.safeParse(formData);

  if (result.success) {
    return null;
  }

  return collectFirstFieldErrors(result.error.issues, PROVIDER_FORM_ERROR_KEYS);
}

export function mapModelFieldErrors(formData: ModelFormData) {
  const result = ModelFormSchema.safeParse(formData);

  if (result.success) {
    return null;
  }

  return collectFirstFieldErrors(result.error.issues, MODEL_FORM_ERROR_KEYS);
}

export function clearFieldError<TField extends string>(
  errors: Partial<Record<TField, string>>,
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  field: TField
) {
  if (errors[field]) {
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }
}

export function createTextareaResizeStartHandler(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  minimumHeight = 80
) {
  return (event: React.MouseEvent) => {
    event.preventDefault();

    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const startY = event.clientY;
    const startHeight = textarea.clientHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newHeight = Math.max(minimumHeight, startHeight + (moveEvent.clientY - startY));
      textarea.style.height = `${newHeight}px`;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
}
