import { expect, it } from 'vitest';

import { createContentRuntimeBuildId } from '../../../apps/extension/build/content-runtime-build-id';
import {
  getTraceWsUrlForMode,
  isTraceMessagesEnabledForMode,
} from '../../../apps/extension/build/injected-build';

it('forces tracing off for release builds even when the environment requests tracing', () => {
  expect(isTraceMessagesEnabledForMode('release', { VITE_TRACE_MESSAGES: 'true' })).toBe(false);
  expect(getTraceWsUrlForMode('release')).toBe('about:blank');
});

it('keeps tracing opt-in for non-release builds', () => {
  expect(isTraceMessagesEnabledForMode('development', { VITE_TRACE_MESSAGES: 'true' })).toBe(true);
  expect(isTraceMessagesEnabledForMode('development', { VITE_TRACE_MESSAGES: 'false' })).toBe(
    false
  );
  expect(getTraceWsUrlForMode('development')).toBe('ws://localhost');
});

it('uses a deterministic content runtime build id for release bundles', () => {
  expect(createContentRuntimeBuildId('release', '0.1.0')).toBe('release-0.1.0');
  expect(createContentRuntimeBuildId('release', '0.1.0')).toBe(
    createContentRuntimeBuildId('release', '0.1.0')
  );
  expect(createContentRuntimeBuildId('release', '0.7.1')).toBe('release-0.7.1');
  expect(createContentRuntimeBuildId('development')).toMatch(/^development-[a-z0-9]+$/u);
});

it('requires the extension version for release content runtime build ids', () => {
  expect(() => createContentRuntimeBuildId('release')).toThrow(/requires an extension version/u);
});
