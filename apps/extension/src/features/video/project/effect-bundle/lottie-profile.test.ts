import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { importAnimationArtifactBytes } from './lottie-profile';
const animation = () => ({
  v: '5.12.2',
  fr: 30,
  ip: 0,
  op: 60,
  w: 320,
  h: 180,
  ddd: 0,
  nm: 'Imported',
  assets: [],
  layers: [],
});
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
it('imports plain Lottie as an independent template without executable controls', async () => {
  const source = animation(),
    result = await importAnimationArtifactBytes(bytes(source));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.documents[0]!.template.animation).toEqual(source);
  expect(result.documents[0]!.template.bindings).toEqual([]);
  expect(result.documents[0]!.template.controls).toEqual([]);
  expect((await importAnimationArtifactBytes(bytes(result.documents[0]!.template))).ok).toBe(true);
});
it.each(['1', '2'])(
  'imports a closed dotLottie v%s archive with multiple animations',
  async (version) => {
    const zip = new JSZip(),
      folder = version === '2' ? 'a' : 'animations';
    zip.file(
      'manifest.json',
      JSON.stringify({ version, animations: [{ id: 'first' }, { id: 'second' }] })
    );
    zip.file(`${folder}/first.json`, JSON.stringify(animation()));
    zip.file(`${folder}/second.json`, JSON.stringify({ ...animation(), nm: 'Second' }));
    const result = await importAnimationArtifactBytes(
      await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.documents.map((entry) => entry.template.label.en)).toEqual([
        'Imported',
        'Second',
      ]);
  }
);
it('refuses legacy V1, external assets, expressions and archives with executable or undeclared files', async () => {
  for (const value of [
    { schema: 'sniptale.effect.v1' },
    { ...animation(), custom: { x: 'alert(1)' } },
    { ...animation(), assets: [{ id: 'img', u: '', p: 'https://example.com/image.png' }] },
  ])
    expect((await importAnimationArtifactBytes(bytes(value))).ok).toBe(false);
  for (const extra of ['script.js', 'unused.json', 's/machine.json']) {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ version: '2', animations: [{ id: 'first' }] }));
    zip.file('a/first.json', JSON.stringify(animation()));
    zip.file(extra, '{}');
    expect(
      (await importAnimationArtifactBytes(await zip.generateAsync({ type: 'uint8array' }))).ok
    ).toBe(false);
  }
});
it('detects CRC corruption without publishing a partial result', async () => {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ version: '2', animations: [{ id: 'first' }] }));
  zip.file('a/first.json', JSON.stringify(animation()));
  const archive = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  const needle = new TextEncoder().encode('Imported');
  const offset = archive.findIndex((_, index) =>
    needle.every((byte, part) => archive[index + part] === byte)
  );
  expect(offset).toBeGreaterThan(0);
  archive[offset] = 88;
  const result = await importAnimationArtifactBytes(archive);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.primaryCode).toBe('BUNDLE_ENTRY_HASH_MISMATCH');
});

it('materializes embedded and archive-local image bytes without retaining external references', async () => {
  const { readFile } = await import('node:fs/promises');
  const png = new Uint8Array(await readFile('apps/extension/public/icons/icon-16.png'));
  const base64 = Buffer.from(png).toString('base64');
  const embedded = {
    ...animation(),
    assets: [{ id: 'image', w: 16, h: 16, u: '', p: `data:image/png;base64,${base64}`, e: 1 }],
  };
  const raw = await importAnimationArtifactBytes(bytes(embedded));
  expect(raw.ok).toBe(true);
  if (raw.ok) {
    expect(raw.documents[0]!.template.resources[0]!.base64).toBe(base64);
    expect(JSON.stringify(raw.documents[0]!.template.animation)).not.toContain('data:image');
  }
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ version: '2', animations: [{ id: 'first' }] }));
  zip.file(
    'a/first.json',
    JSON.stringify({
      ...animation(),
      assets: [{ id: 'image', w: 16, h: 16, u: '/i/', p: 'icon.png', e: 0 }],
    })
  );
  zip.file('i/icon.png', png);
  const imported = await importAnimationArtifactBytes(
    await zip.generateAsync({ type: 'uint8array' })
  );
  expect(imported.ok).toBe(true);
  if (imported.ok) expect(imported.documents[0]!.template.resources[0]!.path).toBe('i/icon.png');
});

it('preserves distinct manifest identities for two animations with identical content', async () => {
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({ version: '2', animations: [{ id: 'first' }, { id: 'second' }] })
  );
  zip.file('a/first.json', JSON.stringify(animation()));
  zip.file('a/second.json', JSON.stringify(animation()));
  const result = await importAnimationArtifactBytes(
    await zip.generateAsync({ type: 'uint8array' })
  );
  expect(result.ok).toBe(true);
  if (result.ok) expect(new Set(result.documents.map((entry) => entry.template.id)).size).toBe(2);
});

it('refuses missing, malformed, duplicate and legacy manifests before accepting an archive', async () => {
  for (const [manifest, code] of [
    [null, 'BUNDLE_MANIFEST_MISSING'],
    ['{', 'BUNDLE_MANIFEST_INVALID'],
    [JSON.stringify({ version: '3' }), 'BUNDLE_MANIFEST_INVALID'],
    [JSON.stringify({ manifestVersion: 'sniptale.bundle.v1' }), 'BUNDLE_ENGINE_UNSUPPORTED'],
    [
      JSON.stringify({ version: '2', animations: [{ id: 'a' }, { id: 'a' }] }),
      'BUNDLE_ENTRY_COLLISION',
    ],
    [JSON.stringify({ version: '2', animations: [{ id: 'missing' }] }), 'BUNDLE_ENTRY_MISSING'],
  ] as const) {
    const zip = new JSZip();
    zip.file('a/first.json', JSON.stringify(animation()));
    if (manifest !== null) zip.file('manifest.json', manifest);
    expect(
      await importAnimationArtifactBytes(await zip.generateAsync({ type: 'uint8array' }))
    ).toMatchObject({ ok: false, primaryCode: code });
  }
  expect(await importAnimationArtifactBytes(new Uint8Array())).toMatchObject({
    ok: false,
    primaryCode: 'BUNDLE_LIMIT_EXCEEDED',
  });
  expect(await importAnimationArtifactBytes(new TextEncoder().encode('{'))).toMatchObject({
    ok: false,
    primaryCode: 'BUNDLE_DOCUMENT_INVALID',
  });
});
it('refuses malformed local font and image metadata without retaining partial resources', async () => {
  for (const extra of [
    { fonts: { list: [{ fFamily: 'Local' }] } },
    { fonts: { list: [{ fFamily: 'Local', fPath: 'fonts/missing.ttf' }] } },
    { assets: [{ id: 'image', p: 'missing.png', u: 7 }] },
    { assets: [{ id: 'image', p: 'data:image/png;base64,!!!', u: '' }] },
  ])
    expect(await importAnimationArtifactBytes(bytes({ ...animation(), ...extra }))).toMatchObject({
      ok: false,
    });
});
