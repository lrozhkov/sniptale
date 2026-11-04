import { expect, it } from 'vitest';

import {
  createEffectRuntimeSandboxUrl,
  isEffectRuntimeSandboxReady,
  readEffectRuntimeCompositionBackend,
  readEffectRuntimeSandboxConnectionNonce,
} from './sandbox-connection';
import { EFFECT_RUNTIME_SANDBOX_READY_MESSAGE } from './types';

const CONNECTION_NONCE = '133a130d-543f-4b31-a4ba-52ec1c16505d';

it.each([
  ['', 'canvas'],
  ['?', 'canvas'],
  ['?composition=gpu-preview', 'gpu-preview'],
  ['?composition=canvas', null],
  ['?composition=unknown', null],
  ['?composition=gpu-preview&composition=gpu-preview', null],
  ['?composition=gpu-preview&extra=1', null],
  ['?extra=1', null],
])('admits only the owned composition selector %s', (query, expected) => {
  expect(readEffectRuntimeCompositionBackend(query)).toBe(expected);
});

it('keeps composition selection separate from the exact connection nonce', () => {
  const url = new URL(
    createEffectRuntimeSandboxUrl(
      'chrome-extension://test/effect-runtime-sandbox.html?composition=gpu-preview',
      CONNECTION_NONCE
    )
  );
  expect(readEffectRuntimeCompositionBackend(url.search)).toBe('gpu-preview');
  expect(readEffectRuntimeSandboxConnectionNonce(url.hash)).toBe(CONNECTION_NONCE);
  expect([...new URLSearchParams(url.hash.slice(1))]).toEqual([
    ['connectionNonce', CONNECTION_NONCE],
  ]);
});

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
