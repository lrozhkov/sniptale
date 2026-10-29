import { createRuntimeMessageFreshnessAuthorizer } from '@sniptale/platform/security/runtime-message-freshness-authorizer';
import { expect, it } from 'vitest';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import { authorizeOffscreenRuntimeMessageFreshness } from './freshness';

const backgroundSender = {
  documentId: 'background-document',
  id: 'sniptale-extension',
  url: 'chrome-extension://sniptale-extension/service-worker-loader.js',
} as chrome.runtime.MessageSender;

it('authorizes fresh offscreen runtime messages and strips transport metadata', () => {
  const result = authorizeOffscreenRuntimeMessageFreshness({
    message: attachRuntimeMessageFreshness(
      { type: 'OFFSCREEN_STOP_RECORDING' },
      { issuedAtEpochMs: 1_700_000_000_000, nonce: 'freshness-test-valid' }
    ),
    nowEpochMs: 1_700_000_000_001,
    sender: backgroundSender,
  });

  expect(result).toEqual({
    authorized: true,
    message: { type: 'OFFSCREEN_STOP_RECORDING' },
  });
});

it('rejects stale offscreen runtime message freshness', () => {
  const result = authorizeOffscreenRuntimeMessageFreshness({
    message: attachRuntimeMessageFreshness(
      { type: 'OFFSCREEN_STOP_RECORDING' },
      { issuedAtEpochMs: 1_700_000_000_000, nonce: 'freshness-test-stale' }
    ),
    nowEpochMs: 1_700_000_200_001,
    sender: backgroundSender,
  });

  expect(result).toEqual({
    authorized: false,
    reason: 'Stale runtime message freshness',
  });
});

it('preserves replay protection when legacy four-thumbnail polling exhausts the shared receiver budget', () => {
  const legacy = createRuntimeMessageFreshnessAuthorizer();
  const authorizeLegacy = (args: Parameters<typeof authorizeOffscreenRuntimeMessageFreshness>[0]) =>
    legacy.authorize({
      message: args.message,
      nowEpochMs: args.nowEpochMs ?? Date.now(),
      scope: 'legacy-background',
    });
  const startedAt = 1_800_000_000_000;
  const sender = { ...backgroundSender, documentId: 'four-thumbnail-polling-proof' };
  let count = 0;
  let refusal: ReturnType<typeof authorizeOffscreenRuntimeMessageFreshness> | null = null;
  for (let tick = 0; tick < 22 && !refusal; tick += 1) {
    for (let card = 0; card < 4 && !refusal; card += 1) {
      for (let hop = 0; hop < 3; hop += 1) {
        const result = authorizeLegacy({
          sender,
          nowEpochMs: startedAt + tick * 150,
          message: attachRuntimeMessageFreshness(
            { type: hop === 2 ? 'OFFSCREEN_SYNC_PRODUCT_COMMAND' : 'OFFSCREEN_SYNC_INSPECT' },
            {
              issuedAtEpochMs: startedAt + tick * 150,
              nonce: `thumbnail-polling-${count}`,
            }
          ),
        });
        count += 1;
        if (!result.authorized) {
          refusal = result;
          break;
        }
      }
    }
  }
  expect(count).toBe(257);
  expect(refusal).toEqual({
    authorized: false,
    reason: 'Runtime message freshness cache exhausted',
  });
  expect(
    authorizeLegacy({
      sender,
      nowEpochMs: startedAt + 3200,
      message: attachRuntimeMessageFreshness(
        { type: 'OFFSCREEN_SYNC_INSPECT' },
        {
          issuedAtEpochMs: startedAt,
          nonce: 'thumbnail-polling-0',
        }
      ),
    })
  ).toEqual({ authorized: false, reason: 'Runtime message replay detected' });
});

it('admits foreground control after 100 distinct thumbnail viewports within the freshness window', () => {
  const now = 1_900_000_000_000;
  const sender = { ...backgroundSender, documentId: 'thumbnail-turnover-proof' };
  for (let card = 0; card < 100; card += 1) {
    for (let hop = 0; hop < 4; hop += 1) {
      const message = attachRuntimeMessageFreshness(
        {
          type: hop % 2 === 0 ? 'OFFSCREEN_SYNC_INSPECT' : 'OFFSCREEN_SYNC_PRODUCT_COMMAND',
          advisory: true,
        },
        { issuedAtEpochMs: now, nonce: `turnover-${card}-${hop}` }
      );
      expect(
        authorizeOffscreenRuntimeMessageFreshness({ message, sender, nowEpochMs: now }).authorized
      ).toBe(true);
    }
  }
  for (const type of [
    'OFFSCREEN_SYNC_INSPECT',
    'OFFSCREEN_SYNC_PRODUCT_COMMAND',
    'OFFSCREEN_SYNC_STOP',
  ]) {
    expect(
      authorizeOffscreenRuntimeMessageFreshness({
        message: attachRuntimeMessageFreshness(
          { type },
          { issuedAtEpochMs: now, nonce: `foreground-${type}` }
        ),
        sender,
        nowEpochMs: now,
      }).authorized
    ).toBe(true);
  }
});

it('reserves control admission at advisory saturation without evicting live nonces', () => {
  const now = 2_000_000_000_000;
  const sender = { ...backgroundSender, documentId: 'thumbnail-capacity-proof' };
  const envelope = (nonce: string, advisory = true, issuedAtEpochMs = now) =>
    attachRuntimeMessageFreshness(
      { type: 'OFFSCREEN_SYNC_INSPECT', ...(advisory ? { advisory: true } : {}) },
      { issuedAtEpochMs, nonce }
    );
  for (let index = 0; index < 3840; index += 1)
    expect(
      authorizeOffscreenRuntimeMessageFreshness({
        message: envelope(`preview-${index}`),
        sender,
        nowEpochMs: now,
      }).authorized
    ).toBe(true);
  expect(
    authorizeOffscreenRuntimeMessageFreshness({
      message: envelope('preview-overflow'),
      sender,
      nowEpochMs: now,
    })
  ).toMatchObject({ authorized: false, reason: 'Runtime message freshness cache exhausted' });
  expect(
    authorizeOffscreenRuntimeMessageFreshness({
      message: envelope('preview-0', false),
      sender,
      nowEpochMs: now,
    })
  ).toMatchObject({ authorized: false, reason: 'Runtime message replay detected' });
  for (let index = 0; index < 256; index += 1)
    expect(
      authorizeOffscreenRuntimeMessageFreshness({
        message: envelope(`control-${index}`, false),
        sender,
        nowEpochMs: now,
      }).authorized
    ).toBe(true);
  expect(
    authorizeOffscreenRuntimeMessageFreshness({
      message: envelope('control-overflow', false),
      sender,
      nowEpochMs: now,
    })
  ).toMatchObject({ authorized: false, reason: 'Runtime message freshness cache exhausted' });
  expect(
    authorizeOffscreenRuntimeMessageFreshness({
      message: envelope('expired-replay'),
      sender,
      nowEpochMs: now + 120000,
    })
  ).toMatchObject({ authorized: false, reason: 'Stale runtime message freshness' });
  expect(
    authorizeOffscreenRuntimeMessageFreshness({
      message: envelope('new-preview', true, now + 120000),
      sender,
      nowEpochMs: now + 120000,
    }).authorized
  ).toBe(true);
});
