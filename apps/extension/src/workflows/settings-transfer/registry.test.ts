import { describe, expect, it } from 'vitest';
import { SETTINGS_TRANSFER_DOMAIN_IDS, SETTINGS_TRANSFER_REGISTRY } from './registry';
import { parseSettingsTransferDomains, SettingsTransferDomainError } from './domain-parser';

describe('settings transfer registry', () => {
  it('covers every frozen visible Settings domain once', () => {
    expect(new Set(SETTINGS_TRANSFER_DOMAIN_IDS).size).toBe(24);
    expect(SETTINGS_TRANSFER_DOMAIN_IDS).toContain('styles.surfaces');
    expect(SETTINGS_TRANSFER_DOMAIN_IDS).toContain('styles.gradients');
    expect(SETTINGS_TRANSFER_DOMAIN_IDS).not.toContain('access.capture-assets');
  });

  it('classifies secrets, device choices, and actions as non-transferable', () => {
    const byId = new Map(SETTINGS_TRANSFER_REGISTRY.map((node) => [node.id, node.classification]));
    expect(byId.get('ai.providers.api-keys')).toBe('secret');
    expect(byId.get('ai.providers.security-binding')).toBe('secret');
    expect(byId.get('system.voice.microphone')).toBe('device-bound');
    expect(byId.has('system.native')).toBe(false);
  });

  it('rejects retired Web Snapshot resource settings instead of importing them', () => {
    expect(() =>
      parseSettingsTransferDomains({
        'access.capture-assets': {
          schemaVersion: 1,
          data: { anonymous: true, authenticated: true },
        },
      })
    ).toThrow(SettingsTransferDomainError);
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
      { items: [{ ...model, authorization: 'canary-secret' }] },
      { items: [model], authorization: 'canary-secret' },
    ]) {
      expect(() =>
        parseSettingsTransferDomains({
          'ai.models': { schemaVersion: 1, data },
        })
      ).toThrow(SettingsTransferDomainError);
    }
  });

  it('rejects unknown popup fields and discards retired Desktop settings', () => {
    expect(() =>
      parseSettingsTransferDomains({
        'interface.preferences': {
          schemaVersion: 1,
          data: { popupStartup: { selection: 'remember-last', authorization: 'canary' } },
        },
      })
    ).toThrow(SettingsTransferDomainError);
    expect(
      parseSettingsTransferDomains({
        'system.native': {
          schemaVersion: 1,
          data: { capture: { video: { webcamDeviceId: 'camera-canary' } } },
        },
      })
    ).toEqual({});
  });
});

it('accepts the persisted popup export destination in its own settings backup', () => {
  expect(
    parseSettingsTransferDomains({
      'interface.preferences': {
        schemaVersion: 1,
        data: {
          popupStartup: {
            selection: 'remember-last',
            lastPage: 'menu',
            lastExportDestination: 'export',
          },
        },
      },
    })
  ).toMatchObject({
    'interface.preferences': { data: { popupStartup: { lastExportDestination: 'export' } } },
  });
});

it('classifies page launcher and quick-action placements as one transferable interface preference', () => {
  expect(
    SETTINGS_TRANSFER_REGISTRY.find((node) => node.id === 'interface.preferences.page-launch')
  ).toMatchObject({
    domainId: 'interface.preferences',
    classification: 'transferable',
    kind: 'scalar',
  });
});

it('preserves browser preferences from an older complete backup without importing Desktop settings', () => {
  const input = {
    'system.native': { schemaVersion: 1, data: { capture: { video: { enabled: true } } } },
    'interface.preferences': { schemaVersion: 1, data: { theme: 'dark', locale: 'en' } },
  };
  expect(parseSettingsTransferDomains(input)).toEqual({
    'interface.preferences': input['interface.preferences'],
  });
  expect(input['system.native'].data.capture.video.enabled).toBe(true);
});
