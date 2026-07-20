// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import {
  clearFieldError,
  createTextareaResizeStartHandler,
  mapModelFieldErrors,
  mapProviderFieldErrors,
} from './helpers';

function verifyProviderFieldErrors() {
  expect(
    mapProviderFieldErrors({
      name: '',
      connectionType: 'openai-compatible',
      baseUrl: 'broken',
      apiKey: '',
    })
  ).toEqual({
    name: translate('settings.aiProviders.providerNameRequired'),
    baseUrl: translate('settings.aiProviders.providerBaseUrlInvalid'),
  });
}

function verifyProviderBaseUrlPolicyError() {
  expect(
    mapProviderFieldErrors({
      name: 'Remote provider',
      connectionType: 'openai-compatible',
      baseUrl: 'http://api.example.com/v1',
      apiKey: '',
    })
  ).toEqual({
    baseUrl: translate('settings.aiProviders.providerBaseUrlHttpsRequired'),
  });
}

function verifyProviderBaseUrlCredentialsError() {
  expect(
    mapProviderFieldErrors({
      name: 'Remote provider',
      connectionType: 'openai-compatible',
      baseUrl: 'https://user:pass@example.com/v1',
      apiKey: '',
    })
  ).toEqual({
    baseUrl: translate('settings.aiProviders.providerBaseUrlInvalid'),
  });
}

function verifyProviderBaseUrlQueryAndHashError() {
  expect(
    mapProviderFieldErrors({
      name: 'Remote provider',
      connectionType: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1?token=secret#frag',
      apiKey: '',
    })
  ).toEqual({
    baseUrl: translate('settings.aiProviders.providerBaseUrlInvalid'),
  });
}

function verifyModelFieldErrors() {
  expect(
    mapModelFieldErrors({
      providerId: '',
      displayName: '',
      modelCode: '',
      systemPrompt: 'x'.repeat(10001),
    })
  ).toEqual({
    providerId: translate('settings.aiProviders.modelProviderRequired'),
    displayName: translate('settings.aiProviders.modelNameRequired'),
    modelCode: translate('settings.aiProviders.modelCodeRequired'),
    systemPrompt: translate('settings.aiProviders.modelPromptTooLong'),
  });
}

function verifyClearFieldError() {
  let nextErrors: Record<string, string> = {};
  const setErrors = vi.fn((updater: React.SetStateAction<Record<string, string>>) => {
    nextErrors = typeof updater === 'function' ? updater({ name: 'problem' }) : updater;
  });

  clearFieldError({ name: 'problem' }, setErrors, 'name');
  clearFieldError({}, setErrors, 'missing');

  expect(setErrors).toHaveBeenCalledTimes(1);
  expect(nextErrors).toEqual({ name: '' });
}

function verifyTextareaResizeHandler() {
  const textarea = document.createElement('textarea');
  Object.defineProperty(textarea, 'clientHeight', { configurable: true, value: 100 });
  const preventDefault = vi.fn();
  const handler = createTextareaResizeStartHandler({ current: textarea });

  handler({ clientY: 200, preventDefault } as unknown as React.MouseEvent);
  document.dispatchEvent(new MouseEvent('mousemove', { clientY: 240 }));
  expect(textarea.style.height).toBe('140px');

  document.dispatchEvent(new MouseEvent('mouseup'));
  document.dispatchEvent(new MouseEvent('mousemove', { clientY: 300 }));

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(textarea.style.height).toBe('140px');
}

function verifyTextareaResizeHandlerMinimumHeightOverride() {
  const textarea = document.createElement('textarea');
  Object.defineProperty(textarea, 'clientHeight', { configurable: true, value: 130 });
  const handler = createTextareaResizeStartHandler({ current: textarea }, 120);

  handler({ clientY: 200, preventDefault: vi.fn() } as unknown as React.MouseEvent);
  document.dispatchEvent(new MouseEvent('mousemove', { clientY: 100 }));
  document.dispatchEvent(new MouseEvent('mouseup'));

  expect(textarea.style.height).toBe('120px');
}

function runAiProvidersSectionFormHooksHelpersSuite() {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps provider validation errors to translated field messages', verifyProviderFieldErrors);
  it(
    'maps remote http provider URLs to the https-required field error',
    verifyProviderBaseUrlPolicyError
  );
  it(
    'maps provider URLs with embedded credentials to the invalid-url field error',
    verifyProviderBaseUrlCredentialsError
  );
  it(
    'maps provider URLs with query or hash to the invalid-url field error',
    verifyProviderBaseUrlQueryAndHashError
  );
  it('maps model validation errors to translated field messages', verifyModelFieldErrors);
  it('clears only existing field errors', verifyClearFieldError);
  it('resizes the textarea while the drag listener is active', verifyTextareaResizeHandler);
  it(
    'respects a custom textarea minimum height override',
    verifyTextareaResizeHandlerMinimumHeightOverride
  );
}

describe('ai-providers-section-form-hooks.helpers', runAiProvidersSectionFormHooksHelpersSuite);
