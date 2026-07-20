import { describe, expect, it } from 'vitest';

import { parseEffectBundleManifest } from './index';

const HASH = 'a'.repeat(64);

describe('EffectV1 bundle manifest boundary', () => {
  it('accepts the exact engine2 manifest shape', () => {
    expect(parseEffectBundleManifest(createManifest())).toEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          engineVersion: '2.0',
          packId: 'sniptale.demo',
        }),
        ok: true,
      })
    );
  });

  it.each([
    [{ ...createManifest(), engineVersion: '1.0' }, 'BUNDLE_ENGINE_UNSUPPORTED'],
    [{ ...createManifest(), renderer: 'source' }, 'BUNDLE_MANIFEST_INVALID'],
    [
      {
        ...createManifest(),
        effectDocuments: [
          {
            ...createManifest().effectDocuments[0],
            path: '../escape.sniptale-effect.json',
          },
        ],
      },
      'BUNDLE_ENTRY_PATH_UNSAFE',
    ],
    [
      {
        ...createManifest(),
        assets: [
          {
            byteLength: 1,
            kind: 'audio',
            mimeType: 'image/png',
            path: 'assets/audio.png',
            sha256: HASH,
          },
        ],
      },
      'BUNDLE_MANIFEST_INVALID',
    ],
  ])('rejects invalid manifest with stable primary code', (manifest, primaryCode) => {
    expect(parseEffectBundleManifest(manifest)).toEqual(
      expect.objectContaining({ ok: false, primaryCode })
    );
  });
});

describe('EffectV1 manifest metadata boundary', () => {
  it('accepts optional localized description and full semantic versions', () => {
    expect(
      parseEffectBundleManifest({
        ...createManifest(),
        description: { en: 'Description', ru: 'Описание' },
        version: '1.2.3-alpha.1+build-2',
      })
    ).toEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({ description: { en: 'Description', ru: 'Описание' } }),
        ok: true,
      })
    );
  });

  it.each(['', '1.2', '01.2.3', '1.2.3+one+two', '1.2.3+bad_suffix'])(
    'rejects non-canonical semantic version %j',
    (version) => {
      expect(parseEffectBundleManifest({ ...createManifest(), version })).toEqual(
        expect.objectContaining({ ok: false, primaryCode: 'BUNDLE_MANIFEST_INVALID' })
      );
    }
  );

  it('rejects missing or empty localized fields', () => {
    expect(
      parseEffectBundleManifest({ ...createManifest(), label: { en: '', ru: 'Демо' } })
    ).toEqual(expect.objectContaining({ ok: false, primaryCode: 'BUNDLE_MANIFEST_INVALID' }));
    const manifest = createManifest();
    Reflect.deleteProperty(manifest, 'label');
    expect(parseEffectBundleManifest(manifest)).toEqual(
      expect.objectContaining({ ok: false, primaryCode: 'BUNDLE_MANIFEST_INVALID' })
    );
  });
});

describe('EffectV1 bundle manifest path ownership', () => {
  it('rejects case-normalized declared path collisions', () => {
    const manifest = createManifest();
    manifest.assets = [
      {
        byteLength: 1,
        kind: 'image',
        mimeType: 'image/png',
        path: 'assets/DEMO.png',
        sha256: HASH,
      },
      {
        byteLength: 1,
        kind: 'image',
        mimeType: 'image/png',
        path: 'assets/demo.png',
        sha256: HASH,
      },
    ];

    expect(parseEffectBundleManifest(manifest)).toEqual(
      expect.objectContaining({ ok: false, primaryCode: 'BUNDLE_ENTRY_COLLISION' })
    );
  });
});

function createManifest() {
  return {
    assets: [] as Array<Record<string, unknown>>,
    effectDocuments: [
      {
        byteLength: 1,
        id: 'demo',
        path: 'effects/demo.sniptale-effect.json',
        schemaVersion: 'sniptale.effect.v1',
        sha256: HASH,
      },
    ],
    engineVersion: '2.0',
    label: { en: 'Demo', ru: 'Демо' },
    manifestVersion: 'sniptale.bundle.v1',
    packId: 'sniptale.demo',
    version: '1.0.0',
  };
}
