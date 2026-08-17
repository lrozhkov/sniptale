import { describe, expect, it } from 'vitest';
import { cloneSettingsTransferJsonValue } from './json-value';
import {
  parseSettingsTransferPackageText,
  SettingsTransferPackageError,
  stringifySettingsTransferPackage,
} from './package-parser';

function packageText(domains: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: 'sniptale-settings',
    formatVersion: 1,
    exportKind: 'selective',
    exportedAt: '2026-08-16T12:00:00.000Z',
    source: { appVersion: '1.0.0' },
    domains,
  });
}

describe('settings transfer package parser', () => {
  it('accepts a readable v1 package', () => {
    expect(
      parseSettingsTransferPackageText(
        packageText({ 'capture.image': { schemaVersion: 1, data: { format: 'png' } } })
      ).domains['capture.image']
    ).toEqual({ schemaVersion: 1, data: { format: 'png' } });
  });

  it('rejects future formats with a stable error code', () => {
    const text = packageText().replace('"formatVersion":1', '"formatVersion":2');
    expect(() => parseSettingsTransferPackageText(text)).toThrowError(
      expect.objectContaining<Partial<SettingsTransferPackageError>>({ code: 'future-format' })
    );
  });

  it.each([
    ['apiKey', 'canary-api-key'],
    ['passphrase', 'canary-passphrase'],
    ['encryptedEnvelope', { ciphertext: 'canary' }],
    ['hasStoredApiKey', true],
    ['microphoneDeviceId', 'canary-device'],
    ['webcamDeviceId', 'canary-camera'],
  ])('rejects forbidden %s material before domain parsing', (key, value) => {
    expect(() =>
      parseSettingsTransferPackageText(
        packageText({ 'ai.providers': { schemaVersion: 1, data: { [key]: value } } })
      )
    ).toThrowError(expect.objectContaining({ code: 'secret-material' }));
  });

  it('rejects JSON deeper than the transfer ceiling', () => {
    let data: Record<string, unknown> = {};
    const root = data;
    for (let index = 0; index < 40; index += 1) {
      data['next'] = {};
      data = data['next'] as Record<string, unknown>;
    }
    expect(() =>
      parseSettingsTransferPackageText(
        packageText({ 'capture.image': { schemaVersion: 1, data: root } })
      )
    ).toThrowError(expect.objectContaining({ code: 'limit-exceeded' }));
  });

  it.each([
    ['{', 'invalid-json'],
    [packageText().replace('"formatVersion":1', '"formatVersion":0'), 'invalid-package'],
    [packageText({ 'capture..image': { schemaVersion: 1, data: {} } }), 'invalid-package'],
  ])('rejects malformed package input with %s', (text, code) => {
    expect(() => parseSettingsTransferPackageText(text)).toThrowError(
      expect.objectContaining({ code })
    );
  });

  it('enforces file, node, and domain count ceilings', () => {
    expect(() => parseSettingsTransferPackageText(' '.repeat(2 * 1024 * 1024 + 1))).toThrowError(
      expect.objectContaining({ code: 'file-too-large' })
    );
    expect(() =>
      parseSettingsTransferPackageText(
        packageText({
          'capture.image': { schemaVersion: 1, data: { items: Array(50_001).fill(null) } },
        })
      )
    ).toThrowError(expect.objectContaining({ code: 'limit-exceeded' }));
    const domains = Object.fromEntries(
      Array.from({ length: 129 }, (_, index) => [`domain${index}`, { schemaVersion: 1, data: {} }])
    );
    expect(() => parseSettingsTransferPackageText(packageText(domains))).toThrowError(
      expect.objectContaining({ code: 'limit-exceeded' })
    );
  });

  it('pretty-prints and clones only JSON-compatible settings values', () => {
    const cloned = cloneSettingsTransferJsonValue({
      finite: 1,
      invalidNumber: Number.POSITIVE_INFINITY,
      omitted: undefined,
      values: [undefined, Symbol('omitted'), () => undefined],
    });
    expect(cloned).toEqual({ finite: 1, invalidNumber: null, values: [null, null, null] });
    expect(() => cloneSettingsTransferJsonValue(undefined)).toThrow(TypeError);
    expect(
      stringifySettingsTransferPackage(parseSettingsTransferPackageText(packageText()))
    ).toMatch(/^\{\n {2}"format":/u);
  });
});
