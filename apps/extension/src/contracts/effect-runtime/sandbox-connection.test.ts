import { expect, it } from 'vitest';

import {
  createEffectRuntimeSandboxUrl,
  isEffectRuntimeSandboxReady,
  readEffectRuntimeSandboxConnectionNonce,
} from './sandbox-connection';
import { EFFECT_RUNTIME_SANDBOX_READY_MESSAGE } from './types';

const CONNECTION_NONCE = '133a130d-543f-4b31-a4ba-52ec1c16505d';

it('round-trips one authenticated sandbox capability in the URL fragment', () => {
  const url = createEffectRuntimeSandboxUrl(
    'chrome-extension://test/effect-runtime-sandbox.html',
    CONNECTION_NONCE
  );

  expect(readEffectRuntimeSandboxConnectionNonce(new URL(url).hash)).toBe(CONNECTION_NONCE);
  expect(readEffectRuntimeSandboxConnectionNonce(`#connectionNonce=${CONNECTION_NONCE}&x=1`)).toBe(
    null
  );
  expect(readEffectRuntimeSandboxConnectionNonce('#connectionNonce=not-a-uuid')).toBe(null);
});

it('accepts only an exact nonce-bound sandbox readiness response', () => {
  expect(
    isEffectRuntimeSandboxReady(
      { connectionNonce: CONNECTION_NONCE, type: EFFECT_RUNTIME_SANDBOX_READY_MESSAGE },
      CONNECTION_NONCE
    )
  ).toBe(true);
  expect(
    isEffectRuntimeSandboxReady(
      {
        connectionNonce: '8be1cb42-ca3c-49ad-8d36-73486091a3bb',
        type: EFFECT_RUNTIME_SANDBOX_READY_MESSAGE,
      },
      CONNECTION_NONCE
    )
  ).toBe(false);
  expect(
    isEffectRuntimeSandboxReady(
      {
        connectionNonce: CONNECTION_NONCE,
        extra: true,
        type: EFFECT_RUNTIME_SANDBOX_READY_MESSAGE,
      },
      CONNECTION_NONCE
    )
  ).toBe(false);
});
