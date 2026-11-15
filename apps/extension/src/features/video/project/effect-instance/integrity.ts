import { verifyRuntimeAnimationSource } from '../../../../contracts/effect-runtime/animation';
import type { VideoProject } from '../types';

class VideoProjectEffectIntegrityError extends Error {
  readonly code = 'effectSnapshotIntegrityFailure';
  constructor() {
    super('Project effect snapshot integrity validation failed');
    this.name = 'VideoProjectEffectIntegrityError';
  }
}

/** Verify complete immutable packages outside persistence transactions and before export. */
export async function verifyVideoProjectEffectSnapshotIntegrity(
  project: VideoProject
): Promise<void> {
  for (const snapshot of project.effectSnapshots ?? []) {
    if (
      snapshot.schemaVersion !== 'sniptale.animation.v1' ||
      snapshot.kind !== 'standalone' ||
      snapshot.assets.length !== 0 ||
      snapshot.id !== `effect:${snapshot.sha256}` ||
      new TextEncoder().encode(snapshot.source).byteLength !== snapshot.retainedByteLength
    )
      throw new VideoProjectEffectIntegrityError();
    const document = await verifyRuntimeAnimationSource(snapshot.source, snapshot.sha256);
    if (!document || document.id !== snapshot.documentId)
      throw new VideoProjectEffectIntegrityError();
  }
}
