import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { createVideoProjectEntry } from './index.test-support';
import {
  parseVideoProjectEntry,
  parseVideoProjectEntryResult,
  parseVideoProjectMetadataEntry,
} from './read-guards';
import type { VideoProjectMetadataEntry } from './contracts';

function metadataEntry(): VideoProjectMetadataEntry {
  const source = readFileSync(
    'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
    'utf8'
  );
  const validated = parseAnimationTemplateSource(source);
  if (!validated.template) throw Error('Invalid animation fixture');
  const sha256 = 'a'.repeat(64);
  return {
    ...createVideoProjectEntry(),
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 3 },
    workspaceRevision: 7,
    project: {
      ...createVideoProjectEntry().project,
      effectSnapshots: [
        {
          assets: [],
          documentId: validated.template.id,
          id: `effect:${sha256}`,
          kind: 'standalone',
          retainedByteLength: new TextEncoder().encode(source).byteLength,
          schemaVersion: 'sniptale.animation.v1',
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
  expect(parsed!.project.effectSnapshots![0]!.assets).toEqual([]);
  expect(parseVideoProjectEntry(entry)).not.toBeNull();
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
