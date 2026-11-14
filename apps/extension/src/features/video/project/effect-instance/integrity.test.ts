import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { createEmptyVideoProject } from '../factories/creation';
import type { VideoProject } from '../types';
import type { VideoProjectEffectSnapshot } from './types';
import { verifyVideoProjectEffectSnapshotIntegrity } from './integrity';

function hashText(source: string) {
  return createHash('sha256').update(source).digest('hex');
}
function fixtureProject(): VideoProject {
  const source = readFileSync(
    'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
    'utf8'
  );
  const parsed = parseAnimationTemplateSource(source);
  if (!parsed.ok) throw new Error('Expected valid shipped animation.');
  const sha256 = hashText(source);
  return {
    ...createEmptyVideoProject('integrity'),
    effectSnapshots: [
      {
        source,
        sha256,
        id: `effect:${sha256}`,
        documentId: parsed.template.id,
        kind: 'standalone',
        schemaVersion: 'sniptale.animation.v1',
        assets: [],
        retainedByteLength: Buffer.byteLength(source),
      },
    ],
  };
}
async function expectIntegrityFailure(project: VideoProject, snapshot: VideoProjectEffectSnapshot) {
  const before = structuredClone(project);
  await expect(
    verifyVideoProjectEffectSnapshotIntegrity({ ...project, effectSnapshots: [snapshot] })
  ).rejects.toMatchObject({ code: 'effectSnapshotIntegrityFailure' });
  expect(project).toEqual(before);
}
function sourceSnapshot(
  snapshot: VideoProjectEffectSnapshot,
  source: string
): VideoProjectEffectSnapshot {
  const sha256 = hashText(source);
  return {
    ...snapshot,
    source,
    sha256,
    id: `effect:${sha256}`,
    retainedByteLength: Buffer.byteLength(source),
  };
}

describe('project-owned self-contained animation snapshot integrity', () => {
  it('accepts the byte-identical source with its verified embedded font', async () => {
    const project = fixtureProject();
    expect(JSON.parse(project.effectSnapshots![0]!.source).resources.length).toBeGreaterThan(0);
    await expect(verifyVideoProjectEffectSnapshotIntegrity(project)).resolves.toBeUndefined();
  });
  it('rejects source digest, parsing, document identity, snapshot identity and retained-size drift', async () => {
    const project = fixtureProject(),
      snapshot = project.effectSnapshots![0]!;
    await expectIntegrityFailure(project, { ...snapshot, sha256: '0'.repeat(64) });
    await expectIntegrityFailure(project, sourceSnapshot(snapshot, '{}'));
    await expectIntegrityFailure(project, { ...snapshot, documentId: 'different-document' });
    await expectIntegrityFailure(project, { ...snapshot, id: 'different-snapshot' });
    await expectIntegrityFailure(project, {
      ...snapshot,
      retainedByteLength: snapshot.retainedByteLength + 1,
    });
  });
  it('rejects missing, duplicate and mismatched embedded resource metadata', async () => {
    const project = fixtureProject(),
      snapshot = project.effectSnapshots![0]!;
    for (const change of ['missing', 'duplicate', 'mime', 'path'] as const) {
      const document = JSON.parse(snapshot.source),
        resource = document.resources[0];
      if (change === 'missing') document.resources = [];
      if (change === 'duplicate') document.resources.push(structuredClone(resource));
      if (change === 'mime') resource.mimeType = 'image/jpeg';
      if (change === 'path') resource.path = 'fonts/different.ttf';
      await expectIntegrityFailure(project, sourceSnapshot(snapshot, JSON.stringify(document)));
    }
  });
  it('rejects truncated and changed bytes even when the complete source hash is recomputed', async () => {
    const project = fixtureProject(),
      snapshot = project.effectSnapshots![0]!;
    for (const truncated of [true, false]) {
      const document = JSON.parse(snapshot.source),
        resource = document.resources[0];
      let bytes = Buffer.from(resource.base64, 'base64');
      if (truncated) bytes = bytes.subarray(0, -1);
      else bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
      resource.base64 = bytes.toString('base64');
      await expectIntegrityFailure(project, sourceSnapshot(snapshot, JSON.stringify(document)));
    }
  });
  it('rejects matching resource hashes whose bytes violate the declared MIME signature', async () => {
    const project = fixtureProject(),
      snapshot = project.effectSnapshots![0]!;
    const document = JSON.parse(snapshot.source),
      resource = document.resources[0],
      bytes = Buffer.alloc(resource.byteLength, 1);
    resource.base64 = bytes.toString('base64');
    resource.sha256 = createHash('sha256').update(bytes).digest('hex');
    await expectIntegrityFailure(project, sourceSnapshot(snapshot, JSON.stringify(document)));
  });
  it('refuses historical snapshot schemas without altering the retained source', async () => {
    const project = fixtureProject(),
      snapshot = project.effectSnapshots![0]!;
    const historical = { ...snapshot };
    Reflect.set(historical, 'schemaVersion', 'sniptale.effect.v1');
    await expectIntegrityFailure(project, historical);
  });
});
