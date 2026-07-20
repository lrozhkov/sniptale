import { describe, expect, it } from 'vitest';

import {
  assertBoundedJsonStructure,
  EffectJsonStructureError,
  type EffectJsonStructureErrorCode,
  parseBoundedEffectJson,
} from './json-structure';
import { EFFECT_BUNDLE_LIMITS } from './limits';
import {
  isCanonicalEffectAssetPath,
  isCanonicalEffectBundlePath,
  isCanonicalEffectDocumentPath,
  normalizeEffectBundlePathForCollision,
} from './path';

describe('EffectV1 JSON structural preflight', () => {
  it('parses bounded UTF-8 JSON as unknown', () => {
    expect(parseBoundedEffectJson(new TextEncoder().encode('{"ok":[1,true]}'))).toEqual({
      ok: [1, true],
    });
  });

  const exhaustionCases: Array<{ code: EffectJsonStructureErrorCode; source: string }> = [
    {
      code: 'depth',
      source:
        '['.repeat(EFFECT_BUNDLE_LIMITS.maxJsonDepth + 1) +
        ']'.repeat(EFFECT_BUNDLE_LIMITS.maxJsonDepth + 1),
    },
    {
      code: 'nodes',
      source: '[' + '0,'.repeat(EFFECT_BUNDLE_LIMITS.maxJsonNodes) + '0]',
    },
    {
      code: 'string',
      source: '"' + 'x'.repeat(EFFECT_BUNDLE_LIMITS.maxJsonStringCharacters + 1) + '"',
    },
    { code: 'syntax', source: '{"open":[' },
  ];

  it.each(exhaustionCases)('rejects $code exhaustion before JSON.parse', ({ code, source }) => {
    expect(() => assertBoundedJsonStructure(source)).toThrow(
      expect.objectContaining<Partial<EffectJsonStructureError>>({ code })
    );
  });

  it('rejects malformed UTF-8 and oversized bytes', () => {
    expect(() => parseBoundedEffectJson(Uint8Array.from([0xc3, 0x28]))).toThrow(
      expect.objectContaining({ code: 'encoding' })
    );
    expect(() =>
      parseBoundedEffectJson(new Uint8Array(EFFECT_BUNDLE_LIMITS.maxJsonBytes + 1))
    ).toThrow(expect.objectContaining({ code: 'size' }));
  });
});

describe('EffectV1 canonical bundle paths', () => {
  it.each([
    'manifest.json',
    'effects/demo.sniptale-effect.json',
    'assets/image.png',
    'assets/nested/sound.ogg',
  ])('accepts %s', (path) => {
    expect(isCanonicalEffectBundlePath(path)).toBe(true);
  });

  it.each([
    '',
    '/absolute',
    'wrapper/',
    '../escape',
    'assets\\file',
    'assets/CON',
    'assets/name.',
    'assets/a?b',
    'assets/кириллица',
  ])('rejects %s', (path) => {
    expect(isCanonicalEffectBundlePath(path)).toBe(false);
  });

  it('keeps document/asset roots and normalized collision keys exact', () => {
    expect(isCanonicalEffectDocumentPath('effects/demo.sniptale-effect.json')).toBe(true);
    expect(isCanonicalEffectDocumentPath('assets/demo.sniptale-effect.json')).toBe(false);
    expect(isCanonicalEffectAssetPath('assets/demo.png')).toBe(true);
    expect(isCanonicalEffectAssetPath('effects/demo.png')).toBe(false);
    expect(normalizeEffectBundlePathForCollision('Assets/DEMO.png')).toBe('assets/demo.png');
  });
});
