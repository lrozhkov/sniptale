import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const liberation = '/usr/share/fonts/truetype/liberation/';
const license = '/usr/share/doc/fonts-liberation/copyright';
export const DEFAULT_CORPUS_FONTS = Object.freeze([
  {
    id: 'sans',
    path: 'packages/ui/src/styles/golos-ui/golos-ui-vf.woff2',
    sha256: 'ec7584959184bcbd5b6cf65c5aacc2ad3ca3afc42ec3b0976f0260c33d1900a1',
    family: 'Golos UI VF',
    licensePath: 'packages/ui/src/styles/golos-ui/LICENSE.txt',
    weight: '100 900',
  },
  {
    id: 'sans-bold',
    path: 'packages/ui/src/styles/golos-ui/golos-ui-vf.woff2',
    sha256: 'ec7584959184bcbd5b6cf65c5aacc2ad3ca3afc42ec3b0976f0260c33d1900a1',
    family: 'Golos UI VF',
    licensePath: 'packages/ui/src/styles/golos-ui/LICENSE.txt',
    weight: '700',
  },
  ...[
    [
      'serif',
      'LiberationSerif-Regular.ttf',
      '705903ae1382f0150f115d6f10a30f5b2f3d6ade649c474afe6366c39174fb65',
      'Liberation Serif',
      'normal',
      '400',
    ],
    [
      'serif-bold',
      'LiberationSerif-Bold.ttf',
      '9e66c25e20868756bf12eb24a520a4552727c9cd108f577f7ae33e3c0110e39c',
      'Liberation Serif',
      'normal',
      '700',
    ],
    [
      'serif-italic',
      'LiberationSerif-Italic.ttf',
      'eaeaf7f2b12544ecde64290c1fa7ec403ff70fd58b313637b265400b20249242',
      'Liberation Serif',
      'italic',
      '400',
    ],
    [
      'mono',
      'LiberationMono-Regular.ttf',
      '395fa5ab8d40c8eba390ced528744ea75a7f69aabf3e68b6f925ca0e39a27370',
      'Liberation Mono',
      'normal',
      '400',
    ],
    [
      'mono-italic',
      'LiberationMono-Italic.ttf',
      'a71b2c25c89da05cf0e7c4dbba8d473fdead0b181ae56165217747d2c1f39215',
      'Liberation Mono',
      'italic',
      '400',
    ],
  ].map(([id, filename, sha256, family, style, weight]) => ({
    id,
    path: liberation + filename,
    sha256,
    family,
    style,
    weight,
    licensePath: license,
  })),
  {
    id: 'handwriting-latin',
    path: 'apps/extension/public/fonts/marck-script-latin-400-normal.woff2',
    sha256: 'b32acf77642711e18c14d57aabeefa02ee25664a7f40929ee5f72396557b6e76',
    family: 'Marck Script',
    licensePath: 'node_modules/@fontsource/marck-script/LICENSE',
  },
  {
    id: 'handwriting-cyrillic',
    path: 'apps/extension/public/fonts/marck-script-cyrillic-400-normal.woff2',
    sha256: '457f5ae9dd211fb276e605a4ce3ecb35cbe1aee8bb1a54698c81d7834873ed06',
    family: 'Marck Script',
    licensePath: 'node_modules/@fontsource/marck-script/LICENSE',
  },
  {
    id: 'arabic',
    path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    sha256: 'ae7b7855e115a5966d8b1b3f80f254ccc117ec86f9965e202ee2940453837280',
    family: 'DejaVu Sans',
    licensePath: '/usr/share/doc/fonts-dejavu-core/copyright',
  },
  {
    id: 'cjk',
    path: '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
    sha256: 'acb6440a713d880a13a21b468ba7cd43f5a2b2934972e51be791c880730777b8',
    family: 'Droid Sans Fallback',
    licensePath: '/usr/share/doc/fonts-droid-fallback/copyright',
  },
]);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fontError(message) {
  return Object.assign(new Error(message), { kind: 'font-error' });
}

export function missingCharacters(charset, text) {
  const ranges = charset
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((range) => range.split('-').map((value) => Number.parseInt(value, 16)));
  return [
    ...new Set(
      [...text].filter((character) => {
        if (/\s/u.test(character)) return false;
        const point = character.codePointAt(0);
        return !ranges.some(([first, last = first]) => point >= first && point <= last);
      })
    ),
  ];
}

/** Admit exact local bytes and the full text cmap before Chromium can select fallback. */
export async function verifyFonts({ fontConfig, textByFace = {} } = {}) {
  let config;
  try {
    config =
      typeof fontConfig === 'string' ? JSON.parse(await readFile(fontConfig, 'utf8')) : fontConfig;
  } catch (error) {
    throw fontError(`Cannot read font configuration: ${error.message}`);
  }
  if (
    fontConfig !== undefined &&
    (!config || typeof config !== 'object' || Array.isArray(config) || !Array.isArray(config.fonts))
  )
    throw fontError('Invalid font configuration');
  const definitions = config ? config.fonts : DEFAULT_CORPUS_FONTS;
  if (!Array.isArray(definitions) || !definitions.length)
    throw fontError('Font configuration is empty');
  const seen = new Set(),
    output = [];
  for (const definition of definitions) {
    if (
      !definition ||
      typeof definition.id !== 'string' ||
      !/^[a-z][a-z0-9-]*$/.test(definition.id) ||
      seen.has(definition.id) ||
      typeof definition.path !== 'string' ||
      typeof definition.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(definition.sha256) ||
      typeof definition.family !== 'string' ||
      typeof definition.licensePath !== 'string'
    )
      throw fontError('Invalid pinned font configuration');
    seen.add(definition.id);
    if (!(definition.id in textByFace)) continue;
    try {
      const path = resolve(root, definition.path),
        bytes = await readFile(path);
      if (hash(bytes) !== definition.sha256)
        throw fontError(`Font hash mismatch: ${definition.id}`);
      const licenseBytes = await readFile(resolve(root, definition.licensePath));
      const metadata = execFileSync(
        'fc-query',
        ['--format', '%{family}\n%{style}\n%{charset}\n', path],
        { encoding: 'utf8', maxBuffer: 1_000_000 }
      ).split('\n');
      const missing = missingCharacters(metadata[2] ?? '', textByFace[definition.id]);
      if (missing.length)
        throw fontError(`Font ${definition.id} lacks characters: ${missing.join(' ')}`);
      if (!metadata[0].split(',').includes(definition.family))
        throw fontError(`Font family mismatch: ${definition.id}`);
      output.push({
        ...definition,
        style: definition.style ?? 'normal',
        weight: definition.weight ?? '400',
        licenseHash: hash(licenseBytes),
        charset: metadata[2],
        base64: bytes.toString('base64'),
      });
    } catch (error) {
      throw fontError(`Font ${definition.id}: ${error.message}`);
    }
  }
  for (const id of Object.keys(textByFace))
    if (!output.some((font) => font.id === id)) throw fontError(`Required font missing: ${id}`);
  return output;
}

export async function installFonts(page, fonts) {
  await page.evaluate(async (definitions) => {
    for (const definition of definitions) {
      const bytes = Uint8Array.from(atob(definition.base64), (character) =>
        character.charCodeAt(0)
      );
      const face = new globalThis.FontFace(`Corpus_${definition.id}`, bytes, {
        style: definition.style,
        weight: definition.weight,
      });
      await face.load();
      globalThis.document.fonts.add(face);
    }
    await globalThis.document.fonts.ready;
  }, fonts);
}

/** Inspect the actual rendered custom font, rather than accepting document.fonts.check alone. */
export async function verifyBrowserFonts(page, fragments, fonts) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root: document } = await cdp.send('DOM.getDocument');
    const evidence = [];
    for (const fragment of fragments) {
      const { nodeId } = await cdp.send('DOM.querySelector', {
        nodeId: document.nodeId,
        selector: `[data-fragment="${fragment.id}"]`,
      });
      const result = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      const expected = fonts.find((font) => font.id === fragment.fontId);
      if (
        !expected ||
        !result.fonts.length ||
        result.fonts.some(
          (font) => !font.isCustomFont || font.familyName !== expected.family || font.glyphCount < 1
        )
      )
        throw fontError(`Unexpected fallback for ${fragment.id}`);
      evidence.push({ fragmentId: fragment.id, fontId: fragment.fontId, rendered: result.fonts });
    }
    return evidence;
  } finally {
    await cdp.detach();
  }
}

export async function verifyArabicShaping(page, fonts) {
  if (!fonts.some((font) => font.id === 'arabic')) return null;
  const result = await page.evaluate(() => {
    const canvas = globalThis.document.createElement('canvas'),
      context = canvas.getContext('2d');
    context.font = '32px Corpus_arabic';
    context.direction = 'rtl';
    return {
      connected: context.measureText('سلام').width,
      disconnected: context.measureText('س\u200cل\u200cا\u200cم').width,
      direction: context.direction,
    };
  });
  if (
    !(result.connected > 0 && result.disconnected > result.connected && result.direction === 'rtl')
  )
    throw fontError('Arabic joining/RTL shaping check failed');
  return result;
}
