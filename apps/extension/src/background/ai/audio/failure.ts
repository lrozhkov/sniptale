import { NoSpeechGeneratedError } from 'ai';
import {
  APICallError,
  InvalidResponseDataError,
  TypeValidationError,
  InvalidArgumentError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { parseAudioJobFailureCode, type AudioJobFailureCode } from '../../../contracts/ai/audio';
import { AIProviderRequestError, classifyAIProviderHttpStatus } from '../providers';

const HTTP_AUDIO_FAILURE_CODES: Partial<Record<number, AudioJobFailureCode>> = {
  400: 'provider-request',
  401: 'provider-auth',
  403: 'provider-auth',
  404: 'provider-not-found',
  405: 'provider-not-found',
  413: 'too-large',
  422: 'provider-request',
  429: 'provider-rate-limit',
};

function audioHttpFailure(status: number): AIProviderRequestError {
  return new AIProviderRequestError(
    classifyAIProviderHttpStatus(status),
    HTTP_AUDIO_FAILURE_CODES[status] ?? 'provider-failed'
  );
}

function sdkAudioFailure(error: unknown): Error | null {
  if (InvalidArgumentError.isInstance(error) || UnsupportedFunctionalityError.isInstance(error))
    return new Error('provider-request');
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    return status === undefined || status < 400
      ? new Error('invalid-response')
      : audioHttpFailure(status);
  }
  if (
    NoSpeechGeneratedError.isInstance(error) ||
    InvalidResponseDataError.isInstance(error) ||
    TypeValidationError.isInstance(error)
  )
    return new Error('invalid-response');
  return null;
}

/** Cancels rejected provider bodies before SDK parsing or product feedback. */
export async function assertResponseStatus(response: Response): Promise<void> {
  if (response.ok) return;
  await response.body?.cancel().catch(() => undefined);
  throw audioHttpFailure(response.status);
}

/** Converts SDK failures to fixed audio codes without retaining provider data or causes. */
export function failAudioProviderRequest(error: unknown, signal: AbortSignal): never {
  signal.throwIfAborted();
  const code = error instanceof Error ? error.message : '';
  if (code === 'provider-response-too-large') throw new Error('too-large');
  if (code === 'provider-redirect-refused') throw new Error('network-failed');
  if (parseAudioJobFailureCode(code))
    throw error instanceof AIProviderRequestError ? error : new Error(code);
  const sdkFailure = sdkAudioFailure(error);
  if (sdkFailure) throw sdkFailure;
  if (error instanceof Error && error.name === 'AbortError') throw new Error('timeout');
  throw new Error('network-failed');
}
