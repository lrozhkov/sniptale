import { parseAnimationPackManifest, type AnimationPackMetadata } from './manifest';
import { z } from 'zod';
import {
  parseAnimationTemplateJson,
  ANIMATION_TEMPLATE_LIMITS,
  type AnimationTemplate,
  type AnimationResource,
} from '@sniptale/runtime-contracts/animation-template';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { decodeBase64Bytes, isBoundedBase64 } from '@sniptale/runtime-contracts/validation/base64';
import { createEffectBundleFailure, type EffectBundleFailure } from './diagnostics';
import { parseBoundedEffectJson } from './json-structure';
import { EFFECT_BUNDLE_LIMITS } from './limits';
import { isCanonicalEffectBundlePath } from './path';
import {
  assertEffectBundleZipLimits,
  readZipEntry,
  isExecutableEntry,
  mapArchiveError,
} from './import/zip/archive';

export type ImportedAnimationTemplate = {
  template: AnimationTemplate;
  sha256: string;
  source: string;
};
export type AnimationArtifactImportResult =
  | {
      ok: true;
      kind: 'lottie-json' | 'dotlottie' | 'sniptale-animation';
      documents: ImportedAnimationTemplate[];
      archiveSha256: string;
      package?: AnimationPackMetadata;
    }
  | EffectBundleFailure;
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u);
const manifestAnimation = z.strictObject({
  id: identifier,
  autoplay: z.boolean().optional(),
  loop: z.union([z.boolean(), z.number().finite().min(0)]).optional(),
  speed: z.number().finite().positive().max(100).optional(),
  direction: z.union([z.literal(1), z.literal(-1)]).optional(),
  playMode: z.enum(['normal', 'bounce']).optional(),
  hover: z.boolean().optional(),
  intermission: z.number().finite().min(0).optional(),
  themeColor: z.string().max(128).optional(),
});
const dotLottieManifest = z.discriminatedUnion('version', [
  z.strictObject({
    version: z.literal('1'),
    animations: z.array(manifestAnimation).min(1).max(EFFECT_BUNDLE_LIMITS.maxDocuments),
    generator: z.string().max(1024).optional(),
    activeAnimationId: identifier.optional(),
    author: z.string().max(1024).optional(),
    description: z.string().max(32768).optional(),
    keywords: z.string().max(4096).optional(),
    revision: z.number().finite().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  }),
  z.strictObject({
    version: z.literal('2'),
    animations: z
      .array(z.strictObject({ id: identifier }))
      .min(1)
      .max(EFFECT_BUNDLE_LIMITS.maxDocuments),
    generator: z.string().max(1024).optional(),
    initial: z.strictObject({ animation: identifier }).optional(),
  }),
]);
class AnimationImportLimitError extends Error {}
const hash = async (bytes: Uint8Array): Promise<string> =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
const toBase64 = (bytes: Uint8Array) => {
  let text = '';
  for (let start = 0; start < bytes.length; start += 32768)
    text += String.fromCharCode(...bytes.subarray(start, start + 32768));
  return btoa(text);
};
function mimeFromPath(path: string): AnimationResource['mimeType'] | null {
  const extension = path.toLowerCase().split('.').at(-1);
  return extension === 'png'
    ? 'image/png'
    : extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'webp'
        ? 'image/webp'
        : extension === 'ttf'
          ? 'font/ttf'
          : extension === 'otf'
            ? 'font/otf'
            : null;
}
function resourcePath(value: string): string | null {
  // dotLottie references are rooted in the archive, never in the animation subdirectory or the network.
  const path = /^\/(?:i|f|images|fonts)\//u.test(value) ? value.slice(1) : value;
  return isCanonicalEffectBundlePath(path) ? path : null;
}
async function normalizeRawAnimation(
  input: Record<string, unknown>,
  files: ReadonlyMap<string, Uint8Array>
): Promise<unknown> {
  const animation = structuredClone(input),
    resources = new Map<string, AnimationResource>();
  let resourceCharacters = 0;
  const add = async (reference: string, fontFamily?: string) => {
    let bytes: Uint8Array, mimeType: AnimationResource['mimeType'] | null, path: string;
    const embedded = /^data:(image\/(?:png|jpeg|webp)|font\/(?:ttf|otf));base64,(.*)$/su.exec(
      reference
    );
    if (embedded) {
      if (!isBoundedBase64(embedded[2], EFFECT_BUNDLE_LIMITS.maxEntryBytes))
        throw new Error('Invalid embedded resource.');
      bytes = decodeBase64Bytes(embedded[2]);
      mimeType =
        embedded[1] === 'image/png'
          ? 'image/png'
          : embedded[1] === 'image/jpeg'
            ? 'image/jpeg'
            : embedded[1] === 'image/webp'
              ? 'image/webp'
              : embedded[1] === 'font/ttf'
                ? 'font/ttf'
                : 'font/otf';
      path = `${fontFamily ? 'fonts' : 'images'}/${await hash(bytes)}.${mimeType.split('/')[1]}`;
    } else {
      const resolved = resourcePath(reference);
      if (!resolved) throw new Error('Invalid resource path.');
      const source = files.get(resolved);
      if (!source) throw new Error('Resource is missing.');
      path = resolved;
      bytes = source;
      mimeType = mimeFromPath(path);
    }
    if (!mimeType || Boolean(fontFamily) !== mimeType.startsWith('font/'))
      throw new Error('Resource type differs.');
    const previous = resources.get(path);
    if (previous && previous.fontFamily !== fontFamily)
      throw new Error('Font family alias is ambiguous.');
    if (!previous) {
      resourceCharacters += Math.ceil(bytes.byteLength / 3) * 4;
      if (resourceCharacters > ANIMATION_TEMPLATE_LIMITS.stringCharacters)
        throw new AnimationImportLimitError();
      resources.set(path, {
        path,
        mimeType,
        ...(fontFamily ? { fontFamily } : {}),
        byteLength: bytes.byteLength,
        sha256: await hash(bytes),
        base64: toBase64(bytes),
      });
    }
    return path;
  };
  const assets = animation['assets'];
  if (Array.isArray(assets))
    for (const asset of assets) {
      if (!isPlainRecord(asset) || typeof asset['p'] !== 'string') continue;
      if (asset['u'] !== undefined && typeof asset['u'] !== 'string')
        throw new Error('Invalid image resource prefix.');
      const path = await add((typeof asset['u'] === 'string' ? asset['u'] : '') + asset['p']);
      asset['p'] = path;
      asset['u'] = '';
      asset['e'] = 0;
    }
  const fonts = animation['fonts'];
  if (isPlainRecord(fonts) && Array.isArray(fonts['list']))
    for (const font of fonts['list']) {
      if (
        !isPlainRecord(font) ||
        typeof font['fFamily'] !== 'string' ||
        typeof font['fPath'] !== 'string' ||
        !font['fPath']
      )
        throw new Error('Font bytes must be local.');
      font['fPath'] = await add(font['fPath'], font['fFamily']);
    }
  const digest = await hash(new TextEncoder().encode(JSON.stringify(animation)));
  const title =
    typeof animation['nm'] === 'string' && animation['nm'].trim()
      ? animation['nm'].slice(0, 32768)
      : 'Animation';
  return {
    format: 'sniptale-animation',
    version: 1,
    id: `animation-${digest.slice(0, 24)}`,
    label: { en: title, ru: title === 'Animation' ? 'Анимация' : title },
    animation,
    controls: [],
    resources: [...resources.values()],
    bindings: [],
  };
}
async function importDocument(
  value: unknown,
  files: ReadonlyMap<string, Uint8Array>,
  documentId?: string
): Promise<{ ok: true; document: ImportedAnimationTemplate } | EffectBundleFailure> {
  if (!isPlainRecord(value))
    return createEffectBundleFailure('BUNDLE_DOCUMENT_INVALID', '$document');
  if (
    value['schemaVersion'] === 'sniptale.effect.v1' ||
    value['schema'] === 'sniptale.effect.v1' ||
    value['manifestVersion'] === 'sniptale.bundle.v1'
  )
    return createEffectBundleFailure('BUNDLE_ENGINE_UNSUPPORTED', '$document');
  let normalized: unknown;
  try {
    normalized =
      value['format'] === 'sniptale-animation' ? value : await normalizeRawAnimation(value, files);
  } catch (error) {
    return createEffectBundleFailure(
      error instanceof AnimationImportLimitError ? 'BUNDLE_LIMIT_EXCEEDED' : 'BUNDLE_ASSET_CLOSURE',
      '$document.resources'
    );
  }
  if (documentId && value['format'] !== 'sniptale-animation' && isPlainRecord(normalized))
    normalized['id'] = documentId;
  const result = await parseAnimationTemplateJson(JSON.stringify(normalized));
  if (!result.ok)
    return {
      ...createEffectBundleFailure('BUNDLE_DOCUMENT_INVALID', '$document'),
      effectDiagnostics: result.diagnostics.map((entry) => ({
        code: entry.code,
        path: entry.path,
        severity: 'error',
      })),
    };
  const source = JSON.stringify(result.template);
  return {
    ok: true,
    document: {
      template: result.template,
      source,
      sha256: await hash(new TextEncoder().encode(source)),
    },
  };
}
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255]!;
  return (value ^ 0xffffffff) >>> 0;
}

/** Import only bounded JSON or a closed dotLottie archive. No URL, expression or player clock is executed. */
export async function importAnimationArtifactBytes(
  bytes: Uint8Array
): Promise<AnimationArtifactImportResult> {
  if (!bytes.byteLength || bytes.byteLength > EFFECT_BUNDLE_LIMITS.maxArchiveBytes)
    return createEffectBundleFailure('BUNDLE_LIMIT_EXCEEDED', '$artifact');
  const archiveSha256 = await hash(bytes);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    let input: unknown;
    try {
      input = parseBoundedEffectJson(bytes);
    } catch {
      return createEffectBundleFailure('BUNDLE_DOCUMENT_INVALID', '$document');
    }
    const result = await importDocument(input, new Map());
    return result.ok
      ? {
          ok: true,
          kind:
            isPlainRecord(input) && input['format'] === 'sniptale-animation'
              ? 'sniptale-animation'
              : 'lottie-json',
          documents: [result.document],
          archiveSha256,
        }
      : result;
  }
  let profile;
  try {
    profile = assertEffectBundleZipLimits(bytes);
  } catch (error) {
    return mapArchiveError(error);
  }
  const entries = profile.entries.filter((entry) => !entry.directory);
  if (entries.some((entry) => isExecutableEntry(entry.name)))
    return createEffectBundleFailure('BUNDLE_EXECUTABLE_ENTRY_FORBIDDEN', '$archive');
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const result = await readZipEntry(bytes, entry);
    if (!result.ok) return result;
    if (crc32(result.bytes) !== entry.crc32)
      return createEffectBundleFailure('BUNDLE_ENTRY_HASH_MISMATCH', '$archive');
    files.set(entry.name, result.bytes);
  }
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) return createEffectBundleFailure('BUNDLE_MANIFEST_MISSING', '$manifest');
  let input: unknown;
  try {
    input = parseBoundedEffectJson(manifestBytes);
  } catch {
    return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', '$manifest');
  }
  if (
    isPlainRecord(input) &&
    (input['manifestVersion'] === 'sniptale.bundle.v1' || input['engineVersion'] === '2.0')
  )
    return createEffectBundleFailure('BUNDLE_ENGINE_UNSUPPORTED', '$manifest');
  if (isPlainRecord(input) && input['format'] === 'sniptale-animation-pack')
    return importAnimationPack(input, files, archiveSha256);
  const manifest = dotLottieManifest.safeParse(input);
  if (!manifest.success) return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', '$manifest');
  if (
    new Set(manifest.data.animations.map((entry) => entry.id)).size !==
    manifest.data.animations.length
  )
    return createEffectBundleFailure('BUNDLE_ENTRY_COLLISION', '$manifest.animations');
  const directory = manifest.data.version === '2' ? 'a' : 'animations';
  const declared = new Set([
    'manifest.json',
    ...manifest.data.animations.map((entry) => `${directory}/${entry.id}.json`),
  ]);
  const documents: ImportedAnimationTemplate[] = [];
  for (const animation of manifest.data.animations) {
    const path = `${directory}/${animation.id}.json`,
      source = files.get(path);
    if (!source) return createEffectBundleFailure('BUNDLE_ENTRY_MISSING', '$archive');
    let input: unknown;
    try {
      input = parseBoundedEffectJson(source);
    } catch {
      return createEffectBundleFailure('BUNDLE_DOCUMENT_INVALID', '$document');
    }
    const documentHash = await hash(new TextEncoder().encode(`${archiveSha256}:${animation.id}`));
    const documentId = `animation-${documentHash.slice(0, 24)}`;
    const result = await importDocument(input, files, documentId);
    if (!result.ok) return result;
    documents.push(result.document);
    for (const resource of result.document.template.resources) {
      const file = files.get(resource.path);
      if (file) {
        if ((await hash(file)) !== resource.sha256)
          return createEffectBundleFailure('BUNDLE_ENTRY_HASH_MISMATCH', '$archive');
        declared.add(resource.path);
      }
    }
  }
  if (new Set(documents.map((entry) => entry.template.id)).size !== documents.length)
    return createEffectBundleFailure('BUNDLE_ENTRY_COLLISION', '$manifest.animations');
  if (files.size !== declared.size || [...files.keys()].some((path) => !declared.has(path)))
    return createEffectBundleFailure('BUNDLE_ENTRY_UNDECLARED', '$archive');
  return { ok: true, kind: 'dotlottie', documents, archiveSha256 };
}

async function importAnimationPack(
  input: unknown,
  files: ReadonlyMap<string, Uint8Array>,
  archiveSha256: string
): Promise<AnimationArtifactImportResult> {
  const manifest = parseAnimationPackManifest(input);
  if (!manifest) return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', '$manifest');
  const paths = new Set(['manifest.json', ...manifest.documents.map((entry) => entry.path)]);
  if ([...files.keys()].some((path) => !paths.has(path)))
    return createEffectBundleFailure('BUNDLE_ENTRY_UNDECLARED', '$archive');
  const documents: ImportedAnimationTemplate[] = [];
  for (const entry of manifest.documents) {
    const bytes = files.get(entry.path);
    if (!bytes) return createEffectBundleFailure('BUNDLE_ENTRY_MISSING', '$archive');
    if (bytes.byteLength !== entry.byteLength || (await hash(bytes)) !== entry.sha256)
      return createEffectBundleFailure('BUNDLE_ENTRY_HASH_MISMATCH', '$archive');
    let value: unknown;
    try {
      value = parseBoundedEffectJson(bytes);
    } catch {
      return createEffectBundleFailure('BUNDLE_DOCUMENT_INVALID', '$document');
    }
    if (!isPlainRecord(value) || value['format'] !== 'sniptale-animation')
      return createEffectBundleFailure('BUNDLE_DOCUMENT_INVALID', '$document');
    const result = await importDocument(value, new Map());
    if (!result.ok) return result;
    if (result.document.template.id !== entry.id)
      return createEffectBundleFailure('BUNDLE_DOCUMENT_INVALID', '$document.id');
    documents.push(result.document);
  }
  return {
    ok: true,
    kind: 'sniptale-animation',
    documents,
    archiveSha256,
    package: manifest.metadata,
  };
}
