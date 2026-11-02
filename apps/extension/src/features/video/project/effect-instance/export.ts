import { writeEffectBundleArchive } from '../effect-bundle/archive-writer';
import {
  parseEffectV1Source,
  sha256EffectV1Bytes,
  validateEffectV1Document,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import type { VideoProjectEffectInstance, VideoProjectEffectSnapshot } from './types';
import type { VideoProject } from '../types';
import type { EffectBundleManifest } from '../effect-bundle/manifest';
import { verifyVideoProjectEffectSnapshotIntegrity } from './integrity';
import { resolveEffectObjectControls } from './layout';

/** Materializes one instance without changing its immutable project snapshot. */
export async function exportEffectInstance(
  project: VideoProject,
  instanceId: string
): Promise<{ blob: Blob; filename: string }> {
  const instance = project.effectInstances?.find(({ id }) => id === instanceId);
  const snapshot = project.effectSnapshots?.find(({ id }) => id === instance?.snapshotId);
  if (!instance || !snapshot) throw new Error('Effect instance is unavailable');
  await verifyVideoProjectEffectSnapshotIntegrity({ ...project, effectSnapshots: [snapshot] });
  const document = materializeInstanceDocument(project, instance, snapshot);
  return packageEffectDocument(document, snapshot);
}

function materializeInstanceDocument(
  project: VideoProject,
  instance: VideoProjectEffectInstance,
  snapshot: VideoProjectEffectSnapshot
): EffectV1Document {
  const document = parseEffectV1Source(snapshot.source, {
    presentationPolicy: 'retained',
  }).document;
  if (!document) throw new Error('Invalid effect snapshot');
  const host = project.clips.find(
    (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
  );
  if (document.objectLayout?.handles?.length && !host) throw new Error('Missing effect body');
  const controls = host
    ? resolveEffectObjectControls(document, instance, host.transform)
    : instance.controls;
  // This export materializes an instance, not the catalog: creation defaults must not reset it.
  delete document.controlPresets;
  delete document.defaultControlPresetId;
  for (const control of document.controls) {
    delete control.localizedDefaultValue;
    const value = controls[control.id] ?? control.defaultValue;
    if (control.kind === 'number' && typeof value === 'number') control.defaultValue = value;
    else if (control.kind !== 'number' && typeof value === 'string') control.defaultValue = value;
    else throw new Error('Invalid effect control');
  }
  return document;
}

async function packageEffectDocument(
  document: EffectV1Document,
  snapshot: VideoProjectEffectSnapshot
) {
  const files = snapshot.assets.map((asset, index) => ({
    asset,
    path: `assets/asset-${index}.${asset.mimeType.split('/')[1] === 'svg+xml' ? 'svg' : asset.mimeType.split('/')[1]}`,
  }));
  for (const declaration of document.assets) {
    const file = files.find(({ asset }) => asset.id === declaration.id);
    if (!file) throw new Error('Missing effect asset');
    delete declaration.dataUrl;
    delete declaration.svgText;
    declaration.path = file.path;
  }
  if (!validateEffectV1Document(document, { presentationPolicy: 'retained' }).ok)
    throw new Error('Invalid exported effect');
  const source = JSON.stringify(document, null, 2);
  const basename = `effect-${document.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100)}`;
  if (!files.length)
    return {
      blob: new Blob([source], { type: 'application/json' }),
      filename: `${basename}.sniptale-effect.json`,
    };
  const bytes = new TextEncoder().encode(source);
  const path = 'effects/effect.sniptale-effect.json';
  const manifest: Omit<EffectBundleManifest, 'assets'> = {
    manifestVersion: 'sniptale.bundle.v1',
    engineVersion: '2.0',
    packId: basename,
    version: '1.0.0',
    label: { en: document.label.en ?? document.id, ru: document.label.ru ?? document.id },
    effectDocuments: [
      {
        id: document.id,
        path,
        schemaVersion: document.schemaVersion,
        byteLength: bytes.byteLength,
        sha256: await sha256EffectV1Bytes(bytes),
      },
    ],
  };
  return {
    blob: await writeEffectBundleArchive({ manifest, documents: [{ path, source }], files }),
    filename: `${basename}.zip`,
  };
}
