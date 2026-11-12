import { parseAnimationTemplateJson } from '@sniptale/runtime-contracts/animation-template';
import type { AnimationCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { parseAnimationCatalogEntry } from './entry';
import { EffectBundlePersistenceError } from './errors';

function throwIntegrityFailure(): never {
  throw new EffectBundlePersistenceError('catalogIntegrityFailure');
}

/** Verify the complete embedded resource closure outside an IndexedDB transaction. */
export async function assertAnimationCatalogIntegrity(entry: AnimationCatalogEntry): Promise<void> {
  const parsed = parseAnimationCatalogEntry(entry);
  if (!parsed) throwIntegrityFailure();
  for (const document of parsed.documents) {
    const bytes = new TextEncoder().encode(document.source);
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0')
    ).join('');
    if (digest !== document.sha256) throwIntegrityFailure();
    const result = await parseAnimationTemplateJson(document.source);
    if (!result.ok || result.template.id !== document.id) throwIntegrityFailure();
  }
}
