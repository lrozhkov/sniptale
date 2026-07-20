// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  isSensitiveAiFieldName,
  isSensitiveAiFormControl,
  redactAiPayloadText,
  shouldOmitAiFieldPayload,
} from './ai-payload-privacy';

function registerFieldPrivacyTests() {
  it('classifies common secret-bearing field names', () => {
    expect(isSensitiveAiFieldName('API key')).toBe(true);
    expect(isSensitiveAiFieldName('One-time code')).toBe(true);
    expect(isSensitiveAiFieldName('Session id')).toBe(true);
    expect(isSensitiveAiFieldName('Email')).toBe(true);
    expect(isSensitiveAiFieldName('Mobile phone')).toBe(true);
    expect(isSensitiveAiFieldName('Display name')).toBe(false);
  });

  it('omits editable fields with secret labels or token-like values', () => {
    expect(shouldOmitAiFieldPayload({ label: 'Password', value: 'visible-secret' })).toBe(true);
    expect(
      shouldOmitAiFieldPayload({ label: 'Notes', value: 'Authorization: Bearer sk-live-secret' })
    ).toBe(true);
    expect(shouldOmitAiFieldPayload({ label: 'Notes', value: 'Public value' })).toBe(false);
  });

  it('classifies sensitive form controls by type and autocomplete metadata', () => {
    const password = document.createElement('input');
    password.type = 'password';
    expect(isSensitiveAiFormControl(password, 'Display name')).toBe(true);

    const otp = document.createElement('input');
    otp.autocomplete = 'one-time-code';
    expect(isSensitiveAiFormControl(otp, 'Code')).toBe(true);

    const safeInput = document.createElement('input');
    safeInput.name = 'displayName';
    expect(isSensitiveAiFormControl(safeInput, 'Display name')).toBe(false);
  });

  it('redacts non-JSON selected text payloads', () => {
    expect(redactAiPayloadText('token=raw-secret')).not.toContain('raw-secret');
  });

  it('redacts markdown table cells under sensitive headers', () => {
    const redacted = redactAiPayloadText(
      '| Password | Display name |\n| --- | --- |\n| markdown-secret | Alice |'
    );

    expect(redacted).not.toContain('markdown-secret');
    expect(redacted).toContain('Alice');
  });
}

function registerEgressRedactionTests() {
  it('redacts raw selected data before AI egress', () => {
    const redacted = redactAiPayloadText(
      JSON.stringify({
        f: [{ id: 'field-password', n: 'Password', c: 'visible-secret', new: '' }],
        t: [{ r: [{ id: 'row-1', d: { token: 'row-secret', Name: 'Alice' }, new: {} }] }],
        note: 'Authorization: Bearer sk-live-secret',
      })
    );

    expect(redacted).not.toContain('visible-secret');
    expect(redacted).not.toContain('row-secret');
    expect(redacted).not.toContain('sk-live-secret');
    expect(redacted).toContain('Alice');
  });
}

function createTableRowPrivacyPayload() {
  return {
    t: [
      {
        r: [
          { id: 'row-api-key', d: { Name: 'API key', Value: 'opaque-secret' }, new: {} },
          { id: 'row-otp', d: { Name: 'OTP', Value: '123456' }, new: {} },
          {
            id: 'row-secret-like',
            d: { Name: 'Reference', Value: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4P5q6' },
            new: {},
          },
          {
            id: 'row-authorization',
            d: { Name: 'Authorization', Value: 'Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==' },
            new: {},
          },
          {
            id: 'row-cookie',
            d: { Name: 'Set-Cookie', Value: 'session=split-cookie-secret' },
            new: {},
          },
          { id: 'row-display', d: { Name: 'Display name', Value: 'Alice' }, new: {} },
        ],
      },
    ],
  };
}

function registerTableRowRedactionTests() {
  it('redacts key-value table cells using sibling row context before AI egress', () => {
    const redacted = redactAiPayloadText(JSON.stringify(createTableRowPrivacyPayload()));

    expect(redacted).not.toContain('opaque-secret');
    expect(redacted).not.toContain('123456');
    expect(redacted).not.toContain('A1b2C3d4E5f6G7h8I9j0K1l2M3n4P5q6');
    expect(redacted).not.toContain('QWxhZGRpbjpvcGVuIHNlc2FtZQ');
    expect(redacted).not.toContain('split-cookie-secret');
    expect(redacted).toContain('Display name');
    expect(redacted).toContain('Alice');
  });
}

describe('AI payload privacy', () => {
  registerFieldPrivacyTests();
  registerEgressRedactionTests();
  registerTableRowRedactionTests();
});
