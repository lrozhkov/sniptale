import { expect, it } from 'vitest';
import { APICallError } from '@ai-sdk/provider';
import { AIProviderRequestError } from '../providers';
import { failAudioProviderRequest } from './failure';

it.each([
  [401, 'invalid-credential', 'provider-auth'],
  [403, 'permission-denied', 'provider-auth'],
  [402, 'quota-exceeded', 'provider-failed'],
  [404, 'model-unavailable', 'provider-not-found'],
  [429, 'rate-limited', 'provider-rate-limit'],
  [503, 'service-error', 'provider-failed'],
  [400, 'unknown', 'provider-request'],
] as const)(
  'retains safe evidence from SDK HTTP %i without SDK fields',
  (statusCode, reason, code) => {
    const sdk = new APICallError({
      message: 'private-sdk-message',
      url: 'https://private.test',
      requestBodyValues: { prompt: 'private-prompt' },
      responseBody: 'private-response',
      statusCode,
    });
    let failure: unknown;
    try {
      failAudioProviderRequest(sdk, new AbortController().signal);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AIProviderRequestError);
    expect(failure).toMatchObject({ reason, message: code });
    expect(failure).not.toHaveProperty('cause');
    expect(failure).not.toHaveProperty('requestBodyValues');
    expect(failure).not.toHaveProperty('responseBody');
    expect(String(failure)).not.toMatch(/private-/);
  }
);

it('preserves cancellation before classifying a provider error', () => {
  const controller = new AbortController();
  const cancelled = new DOMException('Cancelled', 'AbortError');
  controller.abort(cancelled);
  expect(() =>
    failAudioProviderRequest(
      new AIProviderRequestError('quota-exceeded', 'provider-failed'),
      controller.signal
    )
  ).toThrow(cancelled);
});

it('keeps a safe typed error while refusing raw unknown errors', () => {
  const signal = new AbortController().signal;
  const safe = new AIProviderRequestError('permission-denied', 'provider-auth');
  let failure: unknown;
  try {
    failAudioProviderRequest(safe, signal);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBe(safe);
  expect(() => failAudioProviderRequest(new Error('private-prompt'), signal)).toThrow(
    'network-failed'
  );
});

it.each([200, undefined])(
  'keeps SDK status %s as an invalid response without guessing access failure',
  (statusCode) => {
    const error = new APICallError({
      message: 'private-sdk-message',
      url: 'https://private.test',
      requestBodyValues: {},
      ...(statusCode === undefined ? {} : { statusCode }),
    });
    expect(() => failAudioProviderRequest(error, new AbortController().signal)).toThrow(
      'invalid-response'
    );
  }
);

it.each([
  [{ code: 'insufficient_quota' }, 'quota-exceeded', 'provider-failed'],
  [{ code: 'credit_balance_exhausted' }, 'quota-exceeded', 'provider-failed'],
  [{ code: 'organization_spend_limit_exceeded' }, 'quota-exceeded', 'provider-failed'],
  [{ code: 'project_spend_limit_exceeded' }, 'quota-exceeded', 'provider-failed'],
  [{ code: 'organization_usage_limit_exceeded' }, 'quota-exceeded', 'provider-failed'],
  [{ type: 'insufficient_quota' }, 'quota-exceeded', 'provider-failed'],
  [{ code: 'rate_limit_exceeded' }, 'rate-limited', 'provider-rate-limit'],
  [{ code: 429 }, 'rate-limited', 'provider-rate-limit'],
  [{ code: ['insufficient_quota'] }, 'rate-limited', 'provider-rate-limit'],
  [{ message: 'insufficient_quota' }, 'rate-limited', 'provider-rate-limit'],
] as const)('sanitizes SDK HTTP 429 data %j into %s and %s', (metadata, reason, code) => {
  const sdk = new APICallError({
    message: 'private-sdk-message insufficient_quota',
    url: 'https://private.test',
    requestBodyValues: { prompt: 'private-prompt' },
    responseHeaders: { authorization: 'private-secret' },
    responseBody: 'private-response',
    statusCode: 429,
    data: { error: { ...metadata, privateDetail: 'private-data' } },
    cause: new Error('private-cause'),
  });
  let failure: unknown;
  try {
    failAudioProviderRequest(sdk, new AbortController().signal);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AIProviderRequestError);
  expect(failure).toMatchObject({ reason, message: code });
  for (const field of [
    'cause',
    'data',
    'url',
    'requestBodyValues',
    'responseHeaders',
    'responseBody',
  ]) {
    expect(failure).not.toHaveProperty(field);
  }
  expect(String(failure)).not.toMatch(/private-|insufficient_quota/);
  expect(JSON.stringify(failure)).not.toMatch(/private-|insufficient_quota/);
});

it.each([
  [401, 'invalid-credential', 'provider-auth'],
  [403, 'permission-denied', 'provider-auth'],
  [402, 'quota-exceeded', 'provider-failed'],
  [404, 'model-unavailable', 'provider-not-found'],
  [503, 'service-error', 'provider-failed'],
] as const)(
  'keeps audio HTTP %i authoritative over quota metadata',
  (statusCode, reason, message) => {
    const sdk = new APICallError({
      message: 'private-sdk-message',
      url: 'https://private.test',
      requestBodyValues: {},
      statusCode,
      data: { error: { code: 'insufficient_quota' } },
    });
    let failure: unknown;
    try {
      failAudioProviderRequest(sdk, new AbortController().signal);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ reason, message });
  }
);
