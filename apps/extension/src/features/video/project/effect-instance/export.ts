import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
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
  const document = parseEffectV1Source(snapshot.source).document;
  if (!document) throw new Error('Invalid effect snapshot');
  const host = project.clips.find(
    (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
  );
  if (document.objectLayout?.handles?.length && !host) throw new Error('Missing effect body');
  const controls = host
    ? resolveEffectObjectControls(document, instance, host.transform)
    : instance.controls;
  for (const control of document.controls) {
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
  if (!validateEffectV1Document(document).ok) throw new Error('Invalid exported effect');
  const source = JSON.stringify(document, null, 2);
  const basename = `effect-${document.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100)}`;
  if (!files.length)
    return {
      blob: new Blob([source], { type: 'application/json' }),
      filename: `${basename}.sniptale-effect.json`,
    };
  const bytes = new TextEncoder().encode(source);
  const path = 'effects/effect.sniptale-effect.json';
  const manifest: EffectBundleManifest = {
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
    assets: files.map(({ asset, path }) => ({
      path,
      byteLength: asset.byteLength,
      sha256: asset.sha256,
      kind: asset.kind,
      mimeType: asset.mimeType,
    })),
  };
  const writer = new ZipWriter(new BlobWriter('application/zip'), {
    level: 0,
    bufferedWrite: true,
  });
  await writer.add('manifest.json', new TextReader(JSON.stringify(manifest)));
  await writer.add(path, new TextReader(source));
  for (const { asset, path } of files) await writer.add(path, new BlobReader(asset.blob));
  return { blob: await writer.close(), filename: `${basename}.zip` };
}
