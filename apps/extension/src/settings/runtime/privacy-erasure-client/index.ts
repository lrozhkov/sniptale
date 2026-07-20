import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { LocalDataErasureResponse } from '../../../contracts/messaging/privacy-erasure';
import type {
  LocalExtensionDataErasureOptions,
  LocalExtensionDataErasureResult,
} from '../../../composition/persistence/privacy-erasure';
import { sendPrivacyErasureRuntimeMessage } from './transport';

export class LocalDataErasureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalDataErasureError';
  }
}

export async function requestLocalExtensionDataErasure(
  options: LocalExtensionDataErasureOptions
): Promise<LocalExtensionDataErasureResult> {
  const response: LocalDataErasureResponse = await sendPrivacyErasureRuntimeMessage({
    type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
    includeAiProviderSecrets: options.includeAiProviderSecrets,
    preservePreferences: options.preservePreferences,
  });

  if (!response.success || !response.result?.success) {
    throw new LocalDataErasureError(response.error ?? 'Local data erasure failed');
  }

  return response.result;
}
