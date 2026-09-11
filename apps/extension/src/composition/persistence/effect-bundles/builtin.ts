import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import {
  assertEffectV1AssetSignature,
  parseEffectV1Source,
  sha256EffectV1Bytes,
} from '@sniptale/runtime-contracts/effect-v1';
import { parseBoundedEffectJson } from '../../../features/video/project/effect-bundle/json-structure';
import { parseBuiltinEffectIndex } from '../../../features/video/project/effect-bundle/catalog/builtin-index';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { materializeDocumentAssets } from '../../../features/video/project/effect-bundle/import/assets';

/** The identity prefix is outside the imported manifest identifier grammar. */
export const BUILTIN_EFFECT_PREFIX = 'builtin:';
export function createBuiltinEffectResources(read: (path: string) => Promise<Uint8Array>) {
  let pending: Promise<EffectBundleCatalogEntry> | undefined;
  const load = async (): Promise<EffectBundleCatalogEntry> => {
    const index = parseBuiltinEffectIndex(parseBoundedEffectJson(await read('index.json')));
    const manifest = index.manifest;
    const base = {
      packId: `${BUILTIN_EFFECT_PREFIX}${manifest.packId}`,
      source: 'builtin' as const,
      version: manifest.version,
      sourceSha256: index.sourceSha256,
      label: manifest.label,
      description: manifest.description ?? { en: '', ru: '' },
      createdAt: 0,
      updatedAt: 0,
      enabled: true,
      assets: [],
      retainedByteLength: 0,
    };
    const documents = index.documents.map((item, i) => ({
      ...item,
      sha256: manifest.effectDocuments[i]!.sha256,
      schemaVersion: 'sniptale.effect.v1' as const,
      assets: [],
    }));
    const cache = new Map<string, Promise<EffectBundleCatalogEntry>>();
    const materializeDocument = (id: string): Promise<EffectBundleCatalogEntry> => {
      const previous = cache.get(id);
      if (previous) return previous;
      const work = (async () => {
        const declaration = manifest.effectDocuments.find((item) => item.id === id);
        if (!declaration) throw new Error('Unknown builtin effect');
        const bytes = await read(declaration.path);
        if (
          bytes.length !== declaration.byteLength ||
          (await sha256EffectV1Bytes(bytes)) !== declaration.sha256
        )
          throw new Error('Builtin effect integrity failure');
        const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const parsed = parseEffectV1Source(source);
        if (!parsed.document || parsed.document.id !== id)
          throw new Error('Invalid builtin effect');
        const paths = new Map<string, Uint8Array>();
        for (const asset of parsed.document.assets) {
          if (!asset.path || paths.has(asset.path)) continue;
          const declaration = manifest.assets.find((item) => item.path === asset.path);
          if (!declaration) throw new Error('Missing builtin asset');
          const bytes = await read(declaration.path);
          if (
            bytes.length !== declaration.byteLength ||
            (await sha256EffectV1Bytes(bytes)) !== declaration.sha256
          )
            throw new Error('Builtin asset integrity failure');
          assertEffectV1AssetSignature(bytes, declaration.mimeType, 'builtin-resource');
          paths.set(declaration.path, bytes);
        }
        const resolved = await materializeDocumentAssets(
          parsed.document,
          manifest.assets,
          paths,
          new Map()
        );
        if (!resolved.ok) throw new Error('Invalid builtin assets');
        const uniqueAssets = new Map(resolved.assets.map((asset) => [asset.sha256, asset]));
        const assets = [...uniqueAssets.values()].map(({ bytes, ...asset }) => ({
          ...asset,
          blob: new Blob([bytes.slice().buffer], { type: asset.mimeType }),
        }));
        return {
          ...base,
          assets,
          retainedByteLength: bytes.length + assets.reduce((n, a) => n + a.byteLength, 0),
          documents: [
            {
              id,
              kind: parsed.document.kind,
              schemaVersion: 'sniptale.effect.v1' as const,
              source,
              sha256: declaration.sha256,
              assets: resolved.assets.map(({ id, sha256 }) => ({ id, sha256 })),
            },
          ],
        };
      })().catch((error) => {
        cache.delete(id);
        throw error;
      });
      cache.set(id, work);
      return work;
    };
    return { ...base, documents, materializeDocument };
  };
  return {
    load() {
      pending ??= load().catch((error) => {
        pending = undefined;
        throw error;
      });
      return pending;
    },
  };
}

export async function readBuiltinEffectResource(path: string): Promise<Uint8Array> {
  if (
    !/^[a-zA-Z0-9._/-]+$/.test(path) ||
    path.startsWith('/') ||
    path.split('/').some((part) => part === '..' || part === '.' || !part)
  )
    throw new Error('Unsafe builtin resource');
  const response = await fetch(runtimeInfo.getURL(`video-effects/${path}`), {
    credentials: 'omit',
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Builtin resource unavailable');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 16 * 1024 * 1024) throw new Error('Builtin resource too large');
  return bytes;
}
