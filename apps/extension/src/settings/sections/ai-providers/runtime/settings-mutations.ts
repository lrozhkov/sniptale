import type { AIModel } from '../../../../contracts/settings';
import type {
  AIProviderMutationInput,
  AiSettingsMutationMessage,
  AiSettingsMutationResponse,
} from '../../../../contracts/messaging/ai-settings-runtime';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { sendRuntimeMessage } from '../../../../platform/runtime-messaging';

type AiSettingsMutationInput = AiSettingsMutationMessage extends infer TMessage
  ? TMessage extends AiSettingsMutationMessage
    ? Omit<TMessage, 'type'>
    : never
  : never;

export class AiSettingsMutationError extends Error {
  readonly reason: AiSettingsMutationResponse['reason'];

  constructor(message: string, reason: AiSettingsMutationResponse['reason']) {
    super(message);
    this.name = 'AiSettingsMutationError';
    this.reason = reason;
  }
}

export function isAiSettingsMutationError(error: unknown): error is AiSettingsMutationError {
  return error instanceof AiSettingsMutationError;
}

async function sendAiSettingsMutation(
  message: AiSettingsMutationInput
): Promise<AiSettingsMutationResponse> {
  const runtimeMessage = {
    ...message,
    type: MessageType.AI_SETTINGS_MUTATION,
  } as AiSettingsMutationMessage;
  const response = await sendRuntimeMessage(runtimeMessage);
  if (!response.success) {
    throw new AiSettingsMutationError(
      response.error ?? 'AI settings mutation failed',
      response.reason
    );
  }
  return response;
}

export function addAIProvider(provider: AIProviderMutationInput): Promise<void> {
  return sendAiSettingsMutation({ operation: 'add-provider', provider }).then(() => undefined);
}

export function updateAIProvider(provider: AIProviderMutationInput): Promise<void> {
  return sendAiSettingsMutation({ operation: 'update-provider', provider }).then(() => undefined);
}

export function clearAIProviderSecret(providerId: string): Promise<void> {
  return sendAiSettingsMutation({ operation: 'clear-provider-secret', providerId }).then(
    () => undefined
  );
}

export function deleteAIProvider(providerId: string): Promise<void> {
  return sendAiSettingsMutation({ operation: 'delete-provider', providerId }).then(() => undefined);
}

export function addAIModel(model: AIModel): Promise<void> {
  return sendAiSettingsMutation({ operation: 'add-model', model }).then(() => undefined);
}

export function updateAIModel(model: AIModel): Promise<void> {
  return sendAiSettingsMutation({ operation: 'update-model', model }).then(() => undefined);
}

export function deleteAIModel(modelId: string): Promise<void> {
  return sendAiSettingsMutation({ operation: 'delete-model', modelId }).then(() => undefined);
}

export function saveDefaultModelId(defaultModelId: string | null): Promise<void> {
  return sendAiSettingsMutation({
    defaultModelId,
    operation: 'save-default-model',
  }).then(() => undefined);
}

export function saveGlobalSystemPrompt(prompt: string): Promise<void> {
  return sendAiSettingsMutation({ operation: 'save-global-prompt', prompt }).then(() => undefined);
}

export function saveScenarioEditorSystemPrompt(prompt: string): Promise<void> {
  return sendAiSettingsMutation({ operation: 'save-scenario-editor-prompt', prompt }).then(
    () => undefined
  );
}

export function saveChromeAiEnabled(enabled: boolean): Promise<void> {
  return sendAiSettingsMutation({ enabled, operation: 'save-chrome-ai-enabled' }).then(
    () => undefined
  );
}

export function enableAISecretPassphraseProtection(passphrase: string): Promise<void> {
  return sendAiSettingsMutation({
    operation: 'enable-secret-passphrase-protection',
    passphrase,
  }).then(() => undefined);
}

export function disableAISecretPassphraseProtection(passphrase?: string): Promise<void> {
  return sendAiSettingsMutation({
    operation: 'disable-secret-passphrase-protection',
    ...(passphrase === undefined ? {} : { passphrase }),
  }).then(() => undefined);
}

export function unlockAISecretPassphraseProtection(passphrase: string): Promise<void> {
  return sendAiSettingsMutation({
    operation: 'unlock-secret-passphrase-protection',
    passphrase,
  }).then(() => undefined);
}

export function changeAISecretPassphraseProtection(args: {
  currentPassphrase: string;
  nextPassphrase: string;
}): Promise<void> {
  return sendAiSettingsMutation({
    currentPassphrase: args.currentPassphrase,
    nextPassphrase: args.nextPassphrase,
    operation: 'change-secret-passphrase-protection',
  }).then(() => undefined);
}

export function lockAISecretPassphraseProtection(): Promise<void> {
  return sendAiSettingsMutation({ operation: 'lock-secret-passphrase-protection' }).then(
    () => undefined
  );
}

export function resetAISecretPassphraseProtection(): Promise<void> {
  return sendAiSettingsMutation({ operation: 'reset-secret-passphrase-protection' }).then(
    () => undefined
  );
}
