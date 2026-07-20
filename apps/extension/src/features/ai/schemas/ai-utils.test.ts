import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => `translated:${key}`,
}));

import {
  isSchemaMessageKey,
  schemaMessage,
  schemaMessageKey,
  translateSchemaMessage,
} from './ai-utils';

describe('ai-utils', () => {
  it('resolves translated schema messages and preserves stable keys', () => {
    expect(schemaMessage('settings.aiProviders.providerNameRequired')).toBe(
      'translated:settings.aiProviders.providerNameRequired'
    );
    expect(schemaMessageKey('settings.aiProviders.providerNameRequired')).toBe(
      'settings.aiProviders.providerNameRequired'
    );
  });

  it('detects stable schema message keys', () => {
    expect(isSchemaMessageKey('settings.aiProviders.providerNameRequired')).toBe(true);
    expect(isSchemaMessageKey('settings')).toBe(false);
    expect(isSchemaMessageKey('Settings.aiProviders.providerNameRequired')).toBe(false);
    expect(isSchemaMessageKey('settings.aiProviders.provider_name_required')).toBe(false);
  });

  it('translates only stable schema keys', () => {
    expect(translateSchemaMessage('settings.aiProviders.providerNameRequired')).toBe(
      'translated:settings.aiProviders.providerNameRequired'
    );
    expect(translateSchemaMessage('Provider name is required')).toBe('Provider name is required');
  });
});
