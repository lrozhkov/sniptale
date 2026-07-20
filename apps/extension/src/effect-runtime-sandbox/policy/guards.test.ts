import { expect, it } from 'vitest';

import { installEffectRuntimeSandboxGuards } from './guards';

it('denies direct and nested privileged APIs with a typed runtime error', () => {
  const scope = { document: {}, navigator: {} };

  installEffectRuntimeSandboxGuards(scope);

  for (const path of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage']) {
    expect(() => Reflect.get(scope, path)).toThrowError(
      expect.objectContaining({ name: 'SNIPTALE_EFFECT_RUNTIME_API_DENIED' })
    );
  }
  expect(() => Reflect.set(scope.navigator, 'sendBeacon', () => true)).toThrowError(
    expect.objectContaining({ name: 'SNIPTALE_EFFECT_RUNTIME_API_DENIED' })
  );
  expect(() => Reflect.get(scope.document, 'cookie')).toThrowError(
    expect.objectContaining({ name: 'SNIPTALE_EFFECT_RUNTIME_API_DENIED' })
  );
});

it('falls back safely around browser-owned non-configurable descriptors', () => {
  const scope: Record<string, unknown> = { document: null, navigator: 'unavailable' };
  Object.defineProperty(scope, 'fetch', {
    configurable: false,
    value: () => 'original',
    writable: true,
  });
  Object.defineProperty(scope, 'caches', {
    configurable: false,
    value: 'locked',
    writable: false,
  });

  installEffectRuntimeSandboxGuards(scope);

  const guardedFetch = scope['fetch'];
  if (typeof guardedFetch !== 'function') throw new Error('Expected guarded fetch function');
  expect(() => guardedFetch()).toThrow('SNIPTALE_EFFECT_RUNTIME_API_DENIED:fetch');
  expect(scope['caches']).toBe('locked');
});
