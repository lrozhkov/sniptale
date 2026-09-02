import fs from 'node:fs';

import { expect, it } from 'vitest';

import { createContentRuntimeBuildId } from '../../../apps/extension/build/content-runtime-build-id';
import {
  getTraceWsUrlForMode,
  isTraceMessagesEnabledForMode,
  shouldEmitBuildSourcemaps,
} from '../../../apps/extension/build/injected-build';
import { CHROME_BUILD_TARGET, getChromeBuildTarget } from '../../../apps/extension/build/manifest';

it('derives every extension build target from the manifest Chrome baseline', () => {
  expect(getChromeBuildTarget({ minimum_chrome_version: '148' })).toBe('chrome148');
  expect(CHROME_BUILD_TARGET).toBe('chrome148');

  const viteSource = fs.readFileSync('apps/extension/vite.config.ts', 'utf8');
  const injectedSource = fs.readFileSync('apps/extension/build/injected-build.ts', 'utf8');
  expect(viteSource).toContain('target: CHROME_BUILD_TARGET');
  expect(injectedSource.match(/target: \[CHROME_BUILD_TARGET\]/gu)).toHaveLength(2);
  expect(`${viteSource}\n${injectedSource}`).not.toMatch(/target:\s*\[?['"]chrome\d+/u);
});

it.each([undefined, 148, '', '148.0', 'chrome148'])(
  'rejects invalid manifest Chrome baseline %j',
  (minimumChromeVersion) => {
    expect(() => getChromeBuildTarget({ minimum_chrome_version: minimumChromeVersion })).toThrow(
      'minimum_chrome_version must be an integer'
    );
  }
);

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

it('emits build sourcemaps only for explicit diagnostic modes', () => {
  expect(shouldEmitBuildSourcemaps('production')).toBe(false);
  expect(shouldEmitBuildSourcemaps('release')).toBe(false);
  expect(shouldEmitBuildSourcemaps('test-e2e')).toBe(true);
  expect(shouldEmitBuildSourcemaps('security-e2e')).toBe(true);
  expect(shouldEmitBuildSourcemaps('development')).toBe(true);
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
