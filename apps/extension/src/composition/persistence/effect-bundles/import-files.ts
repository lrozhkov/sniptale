import {
  importAnimationArtifact,
  type EffectBundleDiagnosticCode,
} from '../../../features/video/project/effect-bundle';
import { runWithPersistenceDomainMutationLock } from '../infrastructure/mutation-barrier';
import { initDB } from '../infrastructure/indexed-db/core';
import { saveAnimationArtifact, EffectBundlePersistenceError } from './index';
import { parseBoundedEffectJson } from '../../../features/video/project/effect-bundle/json-structure';
import { GL_TRANSITION_PRESET_MAX_BYTES } from '../../../features/video/project/transition/gl-catalog';
import { saveGlPresetCatalogSource } from './gl-presets';

export interface EffectFileImportResult {
  filename: string;
  status: 'imported' | 'failed';
}
/** Each file commits independently; one invalid file must not discard successful imports. */
export async function importEffectFiles(
  files: readonly File[],
  signal?: AbortSignal
): Promise<EffectFileImportResult[]> {
  const results = await importCatalogFiles(files, signal, true);
  return results.map(({ filename, status }) => ({ filename, status }));
}

type AnimationFileImportResult =
  | { filename: string; status: 'imported'; packId: string; unavailablePreferences: string[] }
  | {
      filename: string;
      status: 'failed';
      reason: EffectBundleDiagnosticCode | EffectBundlePersistenceError['code'];
    };

/** The whole user command enters before file I/O; deletion cannot split parsing from publication. */
export async function importAnimationFiles(
  files: readonly File[],
  signal?: AbortSignal
): Promise<AnimationFileImportResult[]> {
  return importCatalogFiles(files, signal, false);
}

async function importCatalogFiles(
  files: readonly File[],
  signal: AbortSignal | undefined,
  includeTransitions: boolean
): Promise<AnimationFileImportResult[]> {
  if (!files.length) return [];
  if (signal?.aborted)
    return files.map((file) => ({
      filename: file.name,
      status: 'failed',
      reason: 'BUNDLE_IMPORT_CANCELLED',
    }));
  // Startup admission can migrate storage and must finish before the command permit.
  await initDB();
  return runWithPersistenceDomainMutationLock('animation-catalog', async (permit) => {
    const results: AnimationFileImportResult[] = [];
    if (signal?.aborted)
      return files.map((file) => ({
        filename: file.name,
        status: 'failed',
        reason: 'BUNDLE_IMPORT_CANCELLED',
      }));
    // Reuse admitted storage under this command permit; no file has been read yet.
    await initDB(permit);
    for (const file of files) {
      try {
        signal?.throwIfAborted();
        if (includeTransitions) {
          const source = await readGlPresetSource(file, signal);
          if (source !== null) {
            signal?.throwIfAborted();
            const saved = await saveGlPresetCatalogSource(source, Date.now(), permit, signal);
            results.push({
              filename: file.name,
              status: 'imported',
              packId: saved.id,
              unavailablePreferences: [],
            });
            continue;
          }
        }
        const imported = await importAnimationArtifact(file, { ...(signal ? { signal } : {}) });
        if (!imported.ok) {
          results.push({ filename: file.name, status: 'failed', reason: imported.primaryCode });
          continue;
        }
        signal?.throwIfAborted();
        const saved = await saveAnimationArtifact(imported, Date.now(), permit, signal);
        results.push({
          filename: file.name,
          status: 'imported',
          packId: saved.entry.packId,
          unavailablePreferences: saved.unavailablePreferences,
        });
      } catch (error) {
        results.push({
          filename: file.name,
          status: 'failed',
          reason: signal?.aborted
            ? 'BUNDLE_IMPORT_CANCELLED'
            : error instanceof EffectBundlePersistenceError
              ? error.code
              : 'BUNDLE_IMPORT_WORKER_FAILURE',
        });
      }
    }
    return results;
  });
}

/** Inspect only a bounded JSON candidate; the source owner still validates every GL field. */
async function readGlPresetSource(file: File, signal?: AbortSignal): Promise<string | null> {
  if (!file.size || file.size > GL_TRANSITION_PRESET_MAX_BYTES) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  if (bytes.byteLength > GL_TRANSITION_PRESET_MAX_BYTES) return null;
  let value: unknown;
  try {
    value = parseBoundedEffectJson(bytes);
  } catch {
    return null;
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('format' in value) ||
    value.format !== 'sniptale-gl-preset'
  )
    return null;
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
