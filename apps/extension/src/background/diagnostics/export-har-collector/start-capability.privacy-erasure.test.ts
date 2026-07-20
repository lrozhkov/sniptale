import { beforeEach, expect, it } from 'vitest';
import { reserveDiagnosticsErasureExclusion } from '../lifecycle-gate';
import {
  consumeExportHarStartAuthorization,
  invalidateExportHarStartAuthorityForPrivacyErasure,
  issueExportHarStartCapability,
} from './start-capability';

const senderUrl = 'chrome-extension://sniptale/content.js';

beforeEach(() => {
  invalidateExportHarStartAuthorityForPrivacyErasure();
});

it('rejects capability issuance while erasure owns the diagnostics exclusion', () => {
  const exclusion = reserveDiagnosticsErasureExclusion();
  try {
    expect(() =>
      issueExportHarStartCapability({ senderUrl, sessionId: 'late', tabId: 31 })
    ).toThrow('HAR capability issuance rejected during local data erasure');
  } finally {
    exclusion.release();
  }
});

it('invalidates capabilities issued before privacy erasure', () => {
  const capabilityToken = issueExportHarStartCapability({
    senderUrl,
    sessionId: 'stale',
    tabId: 32,
  });
  invalidateExportHarStartAuthorityForPrivacyErasure();

  expect(() =>
    consumeExportHarStartAuthorization({
      senderUrl,
      sessionId: 'stale',
      startAuthorization: capabilityToken,
      tabId: 32,
    })
  ).toThrow('invalid start capability token');
});
