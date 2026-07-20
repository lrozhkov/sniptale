import {
  assertEffectV1AssetSignature,
  sha256EffectV1Bytes,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import type { VideoProject } from '../types';
import { parseBoundedEffectJson } from '../effect-bundle/json-structure';

class VideoProjectEffectIntegrityError extends Error {
  readonly code = 'effectSnapshotIntegrityFailure';

  constructor() {
    super('Project effect snapshot integrity validation failed');
    this.name = 'VideoProjectEffectIntegrityError';
  }
}

export async function verifyVideoProjectEffectSnapshotIntegrity(
  project: VideoProject
): Promise<void> {
  for (const snapshot of project.effectSnapshots ?? []) {
    const sourceBytes = new TextEncoder().encode(snapshot.source);
    if ((await sha256EffectV1Bytes(sourceBytes)) !== snapshot.sha256) fail();
    let input: unknown;
    try {
      input = parseBoundedEffectJson(sourceBytes);
    } catch {
      fail();
    }
    const validation = validateEffectV1Document(input);
    if (!validation.ok || !validation.document || validation.document.id !== snapshot.documentId) {
      fail();
    }
    const assets = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
    if (
      assets.size !== snapshot.assets.length ||
      validation.document.assets.length !== assets.size
    ) {
      fail();
    }
    for (const declaration of validation.document.assets) {
      const asset = assets.get(declaration.id);
      if (
        !asset ||
        declaration.sha256 !== asset.sha256 ||
        declaration.byteLength !== asset.byteLength ||
        declaration.kind !== asset.kind ||
        declaration.mimeType !== asset.mimeType
      ) {
        fail();
      }
      const bytes = new Uint8Array(await asset.blob.arrayBuffer());
      if (
        bytes.byteLength !== asset.byteLength ||
        (await sha256EffectV1Bytes(bytes)) !== asset.sha256
      ) {
        fail();
      }
      try {
        assertEffectV1AssetSignature(bytes, asset.mimeType, 'project-effect-asset');
      } catch {
        fail();
      }
    }
  }
}

function fail(): never {
  throw new VideoProjectEffectIntegrityError();
}
