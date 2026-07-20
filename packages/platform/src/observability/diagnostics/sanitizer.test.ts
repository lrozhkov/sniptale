import { describe, expect, it } from 'vitest';

import {
  redactDiagnosticUrlSecrets,
  sanitizeDiagnosticData,
  sanitizeDiagnosticExportData,
  sanitizeDiagnosticMessage,
  sanitizeRawDiagnosticExportData,
  sanitizeStructuredDiagnosticExportData,
  sanitizeDiagnosticUrl,
} from './sanitizer';

describe('diagnostic sanitizer', () => {
  it('redacts configured sensitive keys in nested diagnostic payloads', verifyNestedRedaction);

  it(
    'reuses the shared secret fragment list for auth headers and free-form diagnostic fields',
    verifySharedSecretFragments
  );

  it('drops query and hash fragments from stored diagnostic urls', verifySanitizedUrl);

  it(
    'handles empty and invalid diagnostic urls through the fallback sanitizer path',
    verifyFallbackUrlSanitization
  );

  it('truncates oversized diagnostic messages', verifyTruncatedDiagnosticMessage);

  it(
    'sanitizes non-string diagnostic payloads before they are stringified elsewhere',
    verifyNonStringDiagnosticPayloads
  );

  it('sanitizes nested diagnostic export url fields', verifyDiagnosticExportUrlSanitization);

  it(
    'redacts reusable credentials from raw diagnostic urls while preserving safe query values',
    verifyRawUrlCredentialRedaction
  );

  it(
    'keeps raw diagnostic exports behind mandatory credential redaction',
    verifyRawExportRedaction
  );

  it(
    'preserves structured diagnostic export arrays while sanitizing url fields',
    verifyStructuredExportRedaction
  );

  it('sanitizes structured url-like diagnostic fields and url array entries', verifyUrlLikeFields);
  it('redacts opaque diagnostic url schemes', verifyOpaqueUrlRedaction);
  it('redacts signed url aliases inside free-form diagnostic strings', verifyFreeFormSignedUrls);
  it(
    'redacts structured signed url alias keys without over-redacting signals',
    verifySignedAliasKeys
  );
});

function verifyNestedRedaction() {
  expect(
    sanitizeDiagnosticData({
      nested: {
        apiKey: 'secret',
        authorization: 'Bearer secret',
        cookie: 'session=1',
        'set-cookie': 'session=1',
        text: 'user text',
        value: 'typed value',
      },
    })
  ).toEqual({
    nested: {
      apiKey: '***',
      authorization: '***',
      cookie: '***',
      'set-cookie': '***',
      text: '***',
      value: '***',
    },
  });
}

function verifySharedSecretFragments() {
  expect(
    sanitizeDiagnosticData({
      html: '<div>secret</div>',
      headers: {
        Authorization: 'Bearer secret',
        'proxy-authorization': 'Bearer proxy-secret',
      },
      session: 'session=1',
    })
  ).toEqual({
    html: '***',
    headers: {
      Authorization: '***',
      'proxy-authorization': '***',
    },
    session: '***',
  });
}

function verifySanitizedUrl() {
  expect(sanitizeDiagnosticUrl('https://example.test/path?token=123#hash')).toBe(
    'https://example.test/path'
  );
  expect(sanitizeDiagnosticUrl('/download?X-Amz-Signature=known-secret#frag')).toBe('/download');
  expect(sanitizeDiagnosticUrl('//cdn.example.test/asset?token=known-secret#frag')).toBe(
    '//cdn.example.test/asset'
  );
}

function verifyFallbackUrlSanitization() {
  expect(sanitizeDiagnosticUrl(undefined)).toBeUndefined();
  expect(sanitizeDiagnosticUrl('not a valid url')).toBe('not a valid url');
}

function verifyTruncatedDiagnosticMessage() {
  expect(sanitizeDiagnosticMessage('x'.repeat(400))).toContain('[truncated]');
}

function verifyNonStringDiagnosticPayloads() {
  expect(
    sanitizeDiagnosticData({
      headers: { cookie: 'session=1' },
    })
  ).toEqual({
    headers: { cookie: '***' },
  });
}

function verifyDiagnosticExportUrlSanitization() {
  expect(
    sanitizeDiagnosticExportData({
      requestUrl: 'https://example.test/api?token=known-secret#frag',
      sourceUrl: 'https://example.test/source?token=known-secret#frag',
    })
  ).toEqual({
    requestUrl: 'https://example.test/api',
    sourceUrl: 'https://example.test/source',
  });
}

function verifyRawUrlCredentialRedaction() {
  const secretBearingUrl = [
    'https://user:pass@example.test/api',
    '?token=known-secret&q=public&X-Amz-Credential=scope&X-Amz-Signature=sig',
    '#access_token=hash-secret',
  ].join('');
  const redactedUrl = redactDiagnosticUrlSecrets(secretBearingUrl);

  expect(redactedUrl).toBe(
    'https://example.test/api?token=***&q=public&X-Amz-Credential=***&X-Amz-Signature=***'
  );
  expect(redactedUrl).not.toContain('known-secret');
  expect(redactedUrl).not.toContain('hash-secret');
}

function verifyRawExportRedaction() {
  expect(
    sanitizeRawDiagnosticExportData({
      headers: {
        Authorization: 'Bearer known-secret',
        Accept: 'application/json',
      },
      requestUrl: 'https://example.test/api?signature=signed-secret&q=public#frag',
    })
  ).toEqual({
    headers: {
      Authorization: '***',
      Accept: 'application/json',
    },
    requestUrl: 'https://example.test/api?signature=***&q=public',
  });
}

function verifyStructuredExportRedaction() {
  expect(
    sanitizeStructuredDiagnosticExportData({
      iframePreflight: {
        pendingIframes: ['known-frame', 'https://example.test/embed'],
      },
      page: {
        url: 'https://example.test/callback?token=known-secret#frag',
      },
    })
  ).toEqual({
    iframePreflight: {
      pendingIframes: ['known-frame', 'https://example.test/embed'],
    },
    page: {
      url: 'https://example.test/callback',
    },
  });
}

function verifyUrlLikeFields() {
  expect(
    sanitizeStructuredDiagnosticExportData({
      pendingIframes: [
        'https://example.test/frame?token=known-secret#frag',
        '/frame?X-Amz-Credential=known-secret#frag',
        'frames/child.html?X-Goog-Signature=known-secret#frag',
        'frame-id',
      ],
      node: {
        action: '/submit?sig=known-secret#frag',
        href: 'https://example.test/link?X-Amz-Signature=known-secret#frag',
        linkRef: '/download?X-Amz-Signature=known-secret#frag',
        previewSrc: 'https://example.test/preview?sig=known-secret#frag',
        src: '//cdn.example.test/asset?X-Amz-Credential=known-secret#frag',
      },
    })
  ).toEqual({
    pendingIframes: ['https://example.test/frame', '/frame', 'frames/child.html', 'frame-id'],
    node: {
      action: '/submit',
      href: 'https://example.test/link',
      linkRef: '/download',
      previewSrc: 'https://example.test/preview',
      src: '//cdn.example.test/asset',
    },
  });
}

function verifyOpaqueUrlRedaction() {
  expect(sanitizeDiagnosticUrl('data:text/plain,X-Amz-Signature=known-secret')).toBe(
    '[data URL redacted]'
  );
  expect(redactDiagnosticUrlSecrets('javascript:alert("known-secret")')).toBe(
    '[javascript URL redacted]'
  );
  expect(
    sanitizeStructuredDiagnosticExportData({
      imageUrl: 'data:image/svg+xml,<svg>X-Amz-Signature=known-secret</svg>',
    })
  ).toEqual({
    imageUrl: '[data URL redacted]',
  });
}

function verifyFreeFormSignedUrls() {
  const sanitized = sanitizeDiagnosticData({
    message: [
      'failed https://cdn.test/a?X-Amz-Signature=known-secret',
      'next https://cdn.test/b?X-Goog-Signature=known-secret',
      'credential https://cdn.test/c?X-Amz-Credential=known-secret',
      'policy https://cdn.test/d?policy=known-secret',
      'standalone X-Amz-Signature=known-secret',
      'standalone X-Goog-Signature=known-secret',
      'standalone signature=known-secret',
      'standalone policy=known-secret',
    ].join(' '),
  });

  expect(JSON.stringify(sanitized)).not.toContain('known-secret');
}

function verifySignedAliasKeys() {
  expect(
    sanitizeDiagnosticData({
      matchedSignals: ['signal-a'],
      qualitySignals: ['quality-a'],
      signature: 'known-secret',
      'X-Amz-Signature': 'known-secret',
    })
  ).toEqual({
    matchedSignals: ['signal-a'],
    qualitySignals: ['quality-a'],
    signature: '***',
    'X-Amz-Signature': '***',
  });
  expect(
    sanitizeStructuredDiagnosticExportData({
      credential: 'known-secret',
      policy: 'known-secret',
      sig: 'known-secret',
      xGoogSignature: 'kept because it is not a header/query key',
      'x-goog-signature': 'known-secret',
    })
  ).toEqual({
    credential: '***',
    policy: '***',
    sig: '***',
    xGoogSignature: 'kept because it is not a header/query key',
    'x-goog-signature': '***',
  });
}
