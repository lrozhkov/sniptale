import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { verifyRuntimeAnimationSource } from '../../../contracts/effect-runtime/animation';
import { parseBoundedEffectJson } from '../../../features/video/project/effect-bundle/json-structure';
import { parseBuiltinEffectIndex } from '../../../features/video/project/effect-bundle/catalog/builtin-index';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';

/** The identity prefix is outside the imported package identifier grammar. */
export const BUILTIN_EFFECT_PREFIX = 'builtin:';
export function createBuiltinEffectResources(read: (path: string) => Promise<Uint8Array>) {
  let pending: Promise<EffectBundleCatalogEntry> | undefined;
  const load = async (): Promise<EffectBundleCatalogEntry> => {
    const index = parseBuiltinEffectIndex(parseBoundedEffectJson(await read('index.json')));
    const manifest = index.manifest;
    const base = {
      packId: `${BUILTIN_EFFECT_PREFIX}${manifest.id}`,
      source: 'builtin' as const,
      version: '1',
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
      sha256: manifest.documents[i]!.sha256,
      schemaVersion: 'sniptale.animation.v1' as const,
      assets: [],
    }));
    const cache = new Map<string, Promise<EffectBundleCatalogEntry>>();
    const materializeDocument = (id: string): Promise<EffectBundleCatalogEntry> => {
      const previous = cache.get(id);
      if (previous) return previous;
      const work = (async () => {
        const declaration = manifest.documents.find((item) => item.id === id);
        if (!declaration) throw new Error('Unknown builtin animation');
        const bytes = await read(declaration.path);
        if (bytes.byteLength !== declaration.byteLength)
          throw new Error('Builtin animation integrity failure');
        const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const document = await verifyRuntimeAnimationSource(source, declaration.sha256);
        if (!document || document.id !== id) throw new Error('Builtin animation integrity failure');
        return {
          ...base,
          retainedByteLength: bytes.byteLength,
          documents: [
            {
              id,
              kind: 'standalone' as const,
              schemaVersion: 'sniptale.animation.v1' as const,
              source,
              sha256: declaration.sha256,
              assets: [],
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
