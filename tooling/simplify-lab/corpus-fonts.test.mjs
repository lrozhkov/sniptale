import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CORPUS_FONTS, missingCharacters, verifyFonts } from './corpus-fonts.mjs';
import { recipesFor, requiredFontText } from './corpus-recipes.mjs';

test('all full-profile text has pinned local font bytes and cmap coverage', async () => {
  const fonts = await verifyFonts({
    textByFace: requiredFontText(recipesFor({ profile: 'full' })),
  });
  assert.equal(fonts.length, 11);
  assert.ok(
    fonts.every((font) => font.base64.length > 1000 && /^[a-f0-9]{64}$/.test(font.licenseHash))
  );
});

test('missing bytes, wrong hashes, missing characters and missing faces fail explicitly', async () => {
  const sans = DEFAULT_CORPUS_FONTS[0];
  for (const patch of [{ path: '/missing/corpus-font.ttf' }, { sha256: '0'.repeat(64) }])
    await assert.rejects(
      verifyFonts({ fontConfig: { fonts: [{ ...sans, ...patch }] }, textByFace: { sans: 'Text' } }),
      { kind: 'font-error' }
    );
  await assert.rejects(verifyFonts({ textByFace: { 'handwriting-cyrillic': 'Text 12' } }), {
    kind: 'font-error',
  });
  await assert.rejects(verifyFonts({ textByFace: { absent: 'Text' } }), { kind: 'font-error' });
  await assert.rejects(verifyFonts({ fontConfig: { fonts: [] } }), { kind: 'font-error' });
  await assert.rejects(verifyFonts({ fontConfig: {} }), { kind: 'font-error' });
  assert.deepEqual(missingCharacters('20-7e 401-44f', 'A Я 🌍'), ['🌍']);
});

test('font configuration rejects missing IDs before an unused face can be skipped', async () => {
  const sans = DEFAULT_CORPUS_FONTS[0];
  await assert.rejects(
    verifyFonts({
      fontConfig: { fonts: [sans, { ...sans, id: undefined }] },
      textByFace: { sans: 'Text' },
    }),
    {
      kind: 'font-error',
    }
  );
  await assert.rejects(verifyFonts({ fontConfig: { fonts: [{ ...sans, sha256: undefined }] } }), {
    kind: 'font-error',
  });
});
