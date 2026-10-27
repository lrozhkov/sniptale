import { NoSpeechGeneratedError } from 'ai';
import {
  APICallError,
  InvalidResponseDataError,
  TypeValidationError,
  InvalidArgumentError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { parseAudioJobFailureCode } from '../../../contracts/ai/audio';

/** Cancels rejected provider bodies before SDK parsing or product feedback. */
export async function assertResponseStatus(response: Response): Promise<void> {
  if (response.ok) return;
  await response.body?.cancel().catch(() => undefined);
  if (response.status === 401 || response.status === 403) throw new Error('provider-auth');
  if (response.status === 400 || response.status === 422) throw new Error('provider-request');
  if (response.status === 404 || response.status === 405) throw new Error('provider-not-found');
  if (response.status === 413) throw new Error('too-large');
  if (response.status === 429) throw new Error('provider-rate-limit');
  throw new Error('provider-failed');
}

/** Converts SDK failures to fixed audio codes without retaining provider data or causes. */
export function failAudioProviderRequest(error: unknown, signal: AbortSignal): never {
  signal.throwIfAborted();
  const code = error instanceof Error ? error.message : '';
  if (code === 'provider-response-too-large') throw new Error('too-large');
  if (code === 'provider-redirect-refused') throw new Error('network-failed');
  if (parseAudioJobFailureCode(code)) throw new Error(code);
  if (InvalidArgumentError.isInstance(error) || UnsupportedFunctionalityError.isInstance(error))
    throw new Error('provider-request');
  if (
    NoSpeechGeneratedError.isInstance(error) ||
    InvalidResponseDataError.isInstance(error) ||
    TypeValidationError.isInstance(error) ||
    APICallError.isInstance(error)
  )
    throw new Error('invalid-response');
  if (error instanceof Error && error.name === 'AbortError') throw new Error('timeout');
  throw new Error('network-failed');
}
