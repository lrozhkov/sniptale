import { describe, expect, it } from 'vitest';
import { SETTINGS_TRANSFER_DOMAIN_IDS, SETTINGS_TRANSFER_REGISTRY } from './registry';
import { parseSettingsTransferDomains, SettingsTransferDomainError } from './domain-parser';

describe('settings transfer registry', () => {
  it('covers every frozen visible Settings domain once', () => {
    expect(new Set(SETTINGS_TRANSFER_DOMAIN_IDS).size).toBe(24);
    expect(SETTINGS_TRANSFER_DOMAIN_IDS).toContain('styles.surfaces');
    expect(SETTINGS_TRANSFER_DOMAIN_IDS).toContain('styles.gradients');
    expect(SETTINGS_TRANSFER_DOMAIN_IDS).toContain('access.capture-assets');
  });

  it('classifies secrets, device choices, and actions as non-transferable', () => {
    const byId = new Map(SETTINGS_TRANSFER_REGISTRY.map((node) => [node.id, node.classification]));
    expect(byId.get('ai.providers.api-keys')).toBe('secret');
    expect(byId.get('ai.providers.security-binding')).toBe('secret');
    expect(byId.get('system.voice.microphone')).toBe('device-bound');
    expect(byId.get('system.native.connection')).toBe('action/status');
    expect(byId.get('access.capture-assets.permissions')).toBe('action/status');
  });

  it('rejects undeclared AI provider and provider-domain metadata', () => {
    const provider = {
      id: 'provider-a',
      name: 'Provider',
      connectionType: 'openai-compatible',
      baseUrl: 'https://example.com',
      createdAt: 1,
    };
    for (const data of [
      { items: [{ ...provider, authorization: 'canary-secret' }] },
      { items: [provider], authorization: 'canary-secret' },
    ]) {
      expect(() =>
        parseSettingsTransferDomains({
          'ai.providers': { schemaVersion: 1, data },
        })
      ).toThrow(SettingsTransferDomainError);
    }
  });

  it('rejects undeclared AI model and model-domain metadata', () => {
    const model = {
      id: 'model-a',
      providerId: 'provider-a',
      modelCode: 'model-code',
      displayName: 'Model',
    };
    for (const data of [
      { items: [{ ...model, authorization: 'canary-secret' }], defaultModelId: null },
      { items: [model], defaultModelId: null, authorization: 'canary-secret' },
    ]) {
      expect(() =>
        parseSettingsTransferDomains({
          'ai.models': { schemaVersion: 1, data },
        })
      ).toThrow(SettingsTransferDomainError);
    }
  });

  it('rejects popup and native nested unknown or device-bound fields', () => {
    expect(() =>
      parseSettingsTransferDomains({
        'interface.preferences': {
          schemaVersion: 1,
          data: { popupStartup: { selection: 'remember-last', authorization: 'canary' } },
        },
      })
    ).toThrow(SettingsTransferDomainError);
    expect(() =>
      parseSettingsTransferDomains({
        'system.native': {
          schemaVersion: 1,
          data: { capture: { video: { webcamDeviceId: 'camera-canary' } } },
        },
      })
    ).toThrow(SettingsTransferDomainError);
  });
});
