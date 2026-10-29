import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validateEffectV1Document } from '@sniptale/runtime-contracts/effect-v1';
import { createVideoProjectEntry } from './index.test-support';
import {
  parseVideoProjectEntry,
  parseVideoProjectEntryResult,
  parseVideoProjectMetadataEntry,
} from './read-guards';
import type { VideoProjectMetadataEntry } from './contracts';

function metadataEntry(): VideoProjectMetadataEntry {
  const source = readFileSync(
    new URL(
      '../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
        'neutral-standalone.sniptale-effect.json',
      import.meta.url
    ),
    'utf8'
  );
  const validated = validateEffectV1Document(JSON.parse(source));
  if (!validated.document) throw new Error('Expected valid effect fixture');
  const sha256 = 'a'.repeat(64);
  return {
    ...createVideoProjectEntry(),
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 3 },
    workspaceRevision: 7,
    project: {
      ...createVideoProjectEntry().project,
      effectSnapshots: [
        {
          assets: [
            { id: 'retained-image', kind: 'image', mimeType: 'image/png', byteLength: 3, sha256 },
          ],
          documentId: validated.document.id,
          id: `effect:${sha256}`,
          kind: validated.document.kind,
          retainedByteLength: new TextEncoder().encode(source).byteLength + 3,
          schemaVersion: 'sniptale.effect.v1',
          sha256,
          source,
        },
      ],
    },
  };
}

it('admits an exact project metadata entry without fabricating effect Blobs', () => {
  const entry = metadataEntry();
  const before = JSON.stringify(entry);
  const parsed = parseVideoProjectMetadataEntry(entry);
  expect(parsed).toEqual(entry);
  expect(JSON.stringify(entry)).toBe(before);
  expect(Object.hasOwn(parsed!.project.effectSnapshots![0]!.assets[0]!, 'blob')).toBe(false);
  expect(parseVideoProjectEntry(entry)).toBeNull();
});

it.each([
  { id: 'other-identity' },
  { createdAt: NaN },
  { updatedAt: 'invalid' },
  { workspaceRevision: -1 },
  { workspaceRevision: 1.5 },
  { lifecycle: { storageClass: 'unknown', updatedAt: 1 } },
])('shares native entry refusal for invalid identity, lifecycle and revision: %j', (patch) => {
  const native = { ...createVideoProjectEntry(), ...patch };
  expect(parseVideoProjectEntry(native)).toBeNull();
  expect(parseVideoProjectMetadataEntry(native)).toBeNull();
  expect(parseVideoProjectMetadataEntry({ ...metadataEntry(), ...patch })).toBeNull();
});

it('shares legacy revision defaults and retains unsupported native diagnostics', () => {
  const { workspaceRevision: _revision, ...legacy } = createVideoProjectEntry();
  expect(parseVideoProjectMetadataEntry(legacy)?.workspaceRevision).toBe(0);
  expect(parseVideoProjectEntry(legacy)?.workspaceRevision).toBe(0);
  const unsupported = { ...legacy, project: { ...legacy.project, templateInstances: [] } };
  expect(parseVideoProjectMetadataEntry(unsupported)).toBeNull();
  expect(parseVideoProjectEntryResult(unsupported)).toMatchObject({
    status: 'unsupported',
    reason: 'engine1-template-instances',
  });
  expect(parseVideoProjectEntryResult(undefined)).toEqual({ status: 'notFound' });
  expect(parseVideoProjectMetadataEntry(undefined)).toBeNull();
});
