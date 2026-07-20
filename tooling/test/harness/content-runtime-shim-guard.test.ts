import { expect, it } from 'vitest';

import {
  assertContentRuntimeShimInputsAreCompact,
  assertContentRuntimeShimOutputIsCompact,
} from '../../../apps/extension/build/injected-build-shim-guard';

it.each([
  'src/content/application/runtime-services/services.ts',
  'src/content/platform/runtime-services/services.ts',
])('rejects heavy content runtime shim bundle input %s', (input) => {
  expect(() =>
    assertContentRuntimeShimInputsAreCompact({
      [input]: {},
    })
  ).toThrow('Injected content runtime shim must stay compact');
});

it.each([
  '../../apps/extension/src/platform/runtime-messaging/chrome-transport.ts',
  '../../apps/extension/src/composition/persistence/storage/quick-actions/index.ts',
  '../../apps/extension/src/ui/command-palette/helpers.ts',
  'src/content/overlay/app.tsx',
  'src/content/parser/index.ts',
])('rejects forbidden compact-shim owner %s', (input) => {
  expect(() => assertContentRuntimeShimInputsAreCompact({ [input]: {} })).toThrow(
    'Injected content runtime shim must stay compact'
  );
});

it('rejects oversized content runtime shim output', () => {
  expect(() => assertContentRuntimeShimOutputIsCompact('line\n'.repeat(5001))).toThrow(
    'Injected content runtime shim output is too large'
  );
});

it('accepts compact content runtime shim inputs and output', () => {
  expect(() =>
    assertContentRuntimeShimInputsAreCompact({
      'src/content/runtime/shim/index.ts': {},
      'src/content/runtime/shim/transport.ts': {},
      '../../packages/platform/src/ports/runtime-messaging/content-runtime-shim.ts': {},
      '../../packages/platform/src/security/runtime-message-freshness.ts': {},
    })
  ).not.toThrow();
  expect(() => assertContentRuntimeShimOutputIsCompact('const shim = true;\n')).not.toThrow();
});
