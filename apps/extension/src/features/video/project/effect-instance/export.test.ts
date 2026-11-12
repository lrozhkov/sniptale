import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  parseAnimationTemplateSource,
  verifyAnimationResource,
} from '@sniptale/runtime-contracts/animation-template';
import { resolveEffectControlDefault } from '@sniptale/runtime-contracts/effect-controls';
import { applyInitialEffectPreset } from '../effect-bundle/catalog/presets';
import { importAnimationArtifactBytes } from '../effect-bundle/lottie-profile';
import { createEmptyVideoProject } from '../factories/creation';
import { applyEffectCatalogDocument } from './apply';
import { exportEffectInstance } from './export';
import { resolveEffectObjectControls } from './layout';

async function fixtureProject() {
  const imported = await importAnimationArtifactBytes(
    readFileSync('apps/extension/public/video-effects/animations/callout.sniptale-animation.json')
  );
  if (!imported.ok) throw new Error('Invalid shipped animation fixture.');
  const entry = imported.documents[0]!,
    document = entry.template;
  const base = createEmptyVideoProject('Applied animation export');
  base.version = 52;
  base.duration = 4;
  const project = await applyEffectCatalogDocument({
    project: base,
    documentId: document.id,
    instanceId: 'instance',
    startTime: 0,
    standaloneDuration: 4,
    target: { kind: 'scene' },
    catalog: {
      packId: 'imported-callout',
      source: 'raw-json',
      sourceSha256: imported.archiveSha256,
      version: '1',
      enabled: true,
      createdAt: 0,
      updatedAt: 0,
      assets: [],
      label: { en: document.label.en, ru: document.label.ru ?? document.label.en },
      description: { en: '', ru: '' },
      retainedByteLength: Buffer.byteLength(entry.source),
      documents: [
        {
          id: document.id,
          source: entry.source,
          sha256: entry.sha256,
          assets: [],
          kind: 'standalone',
          schemaVersion: 'sniptale.animation.v1',
        },
      ],
    },
  });
  return { project, document };
}

it('bakes derived negative anchor coordinates and edited defaults without mutating the retained source', async () => {
  const { project, document } = await fixtureProject(),
    instance = project.effectInstances![0]!;
  const snapshot = project.effectSnapshots![0]!,
    host = project.clips.find((clip) => clip.type === 'EFFECT')!;
  instance.sceneAnchors = { tip: { x: 0, y: 0 } };
  Object.assign(instance.controls, document.controlPresets!.at(-1)!.values, {
    title: 'Edited title',
    opacity: 42,
  });
  const originalSource = snapshot.source;
  const before = structuredClone(project),
    expected = resolveEffectObjectControls(document, instance, host.transform);
  const result = await exportEffectInstance(project, 'instance');
  const reimported = await importAnimationArtifactBytes(
    new Uint8Array(await result.blob.arrayBuffer())
  );
  expect(reimported.ok).toBe(true);
  const parsed = parseAnimationTemplateSource(await result.blob.text());
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
  const exported = parsed.template;
  expect(exported.objectLayout).toEqual(document.objectLayout);
  for (const control of exported.controls) expect(control.defaultValue).toBe(expected[control.id]);
  const initial = applyInitialEffectPreset(
    exported,
    Object.fromEntries(
      exported.controls.map((control) => [control.id, resolveEffectControlDefault(control, 'ru')])
    )
  );
  expect(initial).toMatchObject(instance.controls);
  expect(initial['title']).toBe('Edited title');
  expect(expected['tipX']).toBeLessThan(0);
  expect(exported.controlPresets).toBeUndefined();
  expect(exported.defaultControlPresetId).toBeUndefined();
  expect(project).toEqual(before);
  expect(project.effectSnapshots![0]!.source).toBe(originalSource);
});

it('includes verified package-local resources in reimportable self-contained JSON', async () => {
  const { project, document } = await fixtureProject();
  expect(document.resources.some((resource) => resource.mimeType === 'font/ttf')).toBe(true);
  const before = structuredClone(project),
    artifact = await exportEffectInstance(project, 'instance');
  expect(artifact.filename).toMatch(/\.sniptale-animation\.json$/u);
  expect(artifact.blob.type).toBe('application/json');
  const restored = await importAnimationArtifactBytes(
    new Uint8Array(await artifact.blob.arrayBuffer())
  );
  expect(restored).toMatchObject({ ok: true, kind: 'sniptale-animation' });
  if (!restored.ok) throw new Error('Exported package was rejected.');
  expect(restored.documents).toHaveLength(1);
  expect(restored.documents[0]!.template.resources).toEqual(document.resources);
  expect(
    await Promise.all(restored.documents[0]!.template.resources.map(verifyAnimationResource))
  ).toEqual(document.resources.map(() => true));
  expect(project).toEqual(before);
  project.effectSnapshots![0]!.sha256 = '0'.repeat(64);
  await expect(exportEffectInstance(project, 'instance')).rejects.toMatchObject({
    code: 'effectSnapshotIntegrityFailure',
  });
});

it('refuses poisoned embedded resource bytes even with a matching complete source digest', async () => {
  const { project, document } = await fixtureProject();
  document.resources[0]!.sha256 = '0'.repeat(64);
  const source = JSON.stringify(document),
    hash = createHash('sha256').update(source).digest('hex');
  Object.assign(project.effectSnapshots![0]!, {
    id: `effect:${hash}`,
    source,
    sha256: hash,
    retainedByteLength: Buffer.byteLength(source),
  });
  project.effectInstances![0]!.snapshotId = `effect:${hash}`;
  const before = structuredClone(project);
  await expect(exportEffectInstance(project, 'instance')).rejects.toMatchObject({
    code: 'effectSnapshotIntegrityFailure',
  });
  expect(project).toEqual(before);
});

it('rejects missing instances instead of exporting an unrelated template', async () => {
  await expect(exportEffectInstance(createEmptyVideoProject('missing'), 'missing')).rejects.toThrow(
    'Effect instance is unavailable'
  );
});
