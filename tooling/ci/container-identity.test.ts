import { expect, it, vi } from 'vitest';

import {
  resolveContainerDigest,
  resolveGithubRunIdentityEnvironment,
} from './container-identity.mjs';

it('preserves the immutable manifest digest instead of substituting the local config digest', () => {
  const manifest = `sha256:${'a'.repeat(64)}`;
  const inspect = vi.fn(() => `sha256:${'b'.repeat(64)}`);
  expect(resolveContainerDigest(`ghcr.io/lrozhkov/sniptale-qa@${manifest}`, inspect)).toBe(
    manifest
  );
  expect(inspect).not.toHaveBeenCalled();
});

it('uses and validates the local image id only for a mutable local reference', () => {
  const config = `sha256:${'b'.repeat(64)}`;
  expect(resolveContainerDigest('sniptale-qa:local', () => config)).toBe(config);
  expect(() => resolveContainerDigest('sniptale-qa:local', () => 'bad')).toThrow(/immutable/u);
});

it('forwards the exact GitHub rerun identity and rejects missing or invalid attempts', () => {
  expect(
    resolveGithubRunIdentityEnvironment({ GITHUB_RUN_ID: '24', GITHUB_RUN_ATTEMPT: '2' })
  ).toEqual(['GITHUB_RUN_ID=24', 'GITHUB_RUN_ATTEMPT=2']);
  expect(() => resolveGithubRunIdentityEnvironment({ GITHUB_RUN_ID: '24' })).toThrow(
    /GITHUB_RUN_ATTEMPT/u
  );
  expect(() =>
    resolveGithubRunIdentityEnvironment({ GITHUB_RUN_ID: '24', GITHUB_RUN_ATTEMPT: '0' })
  ).toThrow(/GITHUB_RUN_ATTEMPT/u);
  expect(resolveGithubRunIdentityEnvironment({})).toEqual([]);
});
