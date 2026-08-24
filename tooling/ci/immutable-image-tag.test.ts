import { expect, it } from 'vitest';

import { admitImmutableImageTag } from './immutable-image-tag.mjs';

const image = `ghcr.io/lrozhkov/sniptale-qa:sha-${'a'.repeat(40)}`;
const digest = `sha256:${'b'.repeat(64)}`;

function result(status: number, output: string, stderr = '') {
  return { status, signal: null, error: undefined, stdout: output, stderr };
}

it('accepts an existing immutable tag only at the exact digest', () => {
  expect(
    admitImmutableImageTag(image, digest, () => result(0, `Name: ${image}\nDigest: ${digest}\n`))
  ).toBe('exact');
  expect(() =>
    admitImmutableImageTag(image, digest, () =>
      result(0, `Name: ${image}\nDigest: sha256:${'c'.repeat(64)}\n`)
    )
  ).toThrow('Refusing immutable image tag drift');
  expect(() => admitImmutableImageTag(image, digest, () => result(0, 'malformed'))).toThrow(
    'Refusing immutable image tag drift'
  );
});

it('permits creation only after an authoritative missing-manifest response', () => {
  expect(
    admitImmutableImageTag(image, digest, () => result(1, '', `ERROR: ${image}: not found`))
  ).toBe('absent');
  expect(
    admitImmutableImageTag(image, digest, () => result(1, '', 'manifest unknown: manifest unknown'))
  ).toBe('absent');
});

it('fails closed on registry, authentication, timeout, and identity errors', () => {
  for (const failure of [
    result(1, '', 'connection reset by peer'),
    result(1, '', 'unauthorized'),
    { ...result(null as never, ''), error: { code: 'ETIMEDOUT' } },
    { ...result(null as never, ''), signal: 'SIGTERM' },
  ]) {
    expect(() => admitImmutableImageTag(image, digest, () => failure)).toThrow(
      'Unable to inspect immutable image tag'
    );
  }
  expect(() => admitImmutableImageTag('invalid', digest, () => result(1, ''))).toThrow(
    'canonical image and digest identities'
  );
});
