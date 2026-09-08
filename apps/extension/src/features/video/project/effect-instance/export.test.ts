import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseEffectV1Source, sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
import { createEmptyVideoProject } from '../factories/creation';
import { createEffectHostClip } from '../factories/overlay-clip';
import { importEffectBundleZip, importRawEffectDocument } from '../effect-bundle/import/zip';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { exportEffectInstance } from './export';
import { initializeEffectSceneAnchors, resolveEffectObjectControls } from './layout';
import type { VideoProject } from '../types';
import type { ImportedEffectDocument } from '../effect-bundle/import/types';

async function fixtureProject(imported: ImportedEffectDocument): Promise<VideoProject> {
  const document = imported.document;
  const source = imported.source;
  const digest = await sha256EffectV1Bytes(new TextEncoder().encode(source));
  const host = createEffectHostClip({
    effectInstanceId: 'instance',
    duration: document.duration,
    name: 'Effect',
    startTime: 0,
    trackId: 'video',
    projectWidth: 1920,
    projectHeight: 1080,
    ...(document.objectLayout ? { objectLayout: document.objectLayout } : {}),
  });
  const anchors = initializeEffectSceneAnchors(document, host.transform, {
    width: 1920,
    height: 1080,
  });
  return {
    ...createEmptyVideoProject('export'),
    clips: [host],
    effectSnapshots: [
      {
        id: `effect:${digest}`,
        sha256: digest,
        documentId: document.id,
        kind: document.kind,
        schemaVersion: document.schemaVersion,
        source,
        retainedByteLength:
          new TextEncoder().encode(source).byteLength +
          imported.assets.reduce((n, a) => n + a.byteLength, 0),
        assets: imported.assets.map((a) => ({
          ...a,
          blob: new Blob([Uint8Array.from(a.bytes).buffer], { type: a.mimeType }),
        })),
      },
    ],
    effectInstances: [
      {
        id: 'instance',
        snapshotId: `effect:${digest}`,
        kind: document.kind,
        target: { kind: 'scene' },
        controls: {},
        duration: document.duration,
        playbackRate: 1,
        startTime: 0,
        enabled: true,
        ...(anchors ? { sceneAnchors: anchors } : {}),
      },
    ],
  };
}
it('bakes derived negative anchor coordinates and preserves layout without mutating the snapshot', async () => {
  const bytes = readFileSync(
    new URL(
      '../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/' +
        'sniptale-callout-light.sniptale-effect.json',
      import.meta.url
    )
  );
  const imported = await importRawEffectDocument(bytes);
  if (!imported.ok) throw new Error('Invalid fixture');
  const project = await fixtureProject(imported.artifact.document);
  const instance = project.effectInstances![0]!;
  const snapshot = project.effectSnapshots![0]!;
  const original = snapshot.source;
  instance.sceneAnchors = { tip: { x: 0, y: 0 } };
  instance.controls['sequence'] = 2;
  const result = await exportEffectInstance(project, 'instance');
  const reimported = await importRawEffectDocument(new Uint8Array(await result.blob.arrayBuffer()));
  expect(reimported.ok).toBe(true);
  const exported = parseEffectV1Source(await result.blob.text()).document!;
  expect(exported.objectLayout).toEqual(imported.artifact.document.document.objectLayout);
  const expected = resolveEffectObjectControls(exported, instance, project.clips[0]!.transform);
  for (const id of ['anchorX', 'anchorY', 'sequence'])
    expect(exported.controls.find((c) => c.id === id)?.defaultValue).toBe(expected[id]);
  expect(expected['anchorX']).toBeLessThan(0);
  expect(snapshot.source).toBe(original);
});
it('includes and verifies dependencies in an importable portable ZIP', async () => {
  const fixture = EFFECT_BUNDLE_CORPUS.find((c) =>
    c.artifact.includes('asset-bearing-conformance')
  )!;
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(fixture));
  if (!imported.ok) throw new Error('Invalid fixture');
  const project = await fixtureProject(imported.bundle.documents[0]!);
  const artifact = await exportEffectInstance(project, 'instance');
  const restored = await importEffectBundleZip(artifact.blob);
  expect(restored).toMatchObject({ ok: true });
  if (!restored.ok) return;
  expect(restored.bundle.documents[0]!.assets.map((a) => a.sha256)).toEqual(
    project.effectSnapshots![0]!.assets.map((a) => a.sha256)
  );
  project.effectSnapshots![0]!.sha256 = '0'.repeat(64);
  await expect(exportEffectInstance(project, 'instance')).rejects.toThrow();
});

it('rejects missing instances instead of exporting an unrelated template', async () => {
  await expect(exportEffectInstance(createEmptyVideoProject('missing'), 'missing')).rejects.toThrow(
    'Effect instance is unavailable'
  );
});
