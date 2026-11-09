import { getCurrentLocale, translate } from '../../../../platform/i18n';
import { getEffectInstanceLabel } from '../effect-instance/presentation';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  resolveEffectLocaleText,
  sha256EffectV1Bytes,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import { createEmptyVideoProject } from '../factories/creation';
import { isEffectProjectBranches } from '../validation/effect-instances';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../effect-instance/integrity';
import { parseEffectRuntimeSnapshotDocument } from '../../composition/effect-runtime/runtime/snapshot-document';
import { readReviewAnnotationEffectDocument } from '../../review/annotation-effects/validation';
import { readEffectPresentationDocument } from './presentation-document';
import { importRawEffectDocument } from './import/raw';

const source = readFileSync(
  new URL('./fixtures/retained/title.sniptale-effect.json', import.meta.url),
  'utf8'
);

it('refuses duplicate icons in new imports while retaining the exact historical project source', async () => {
  const bytes = new TextEncoder().encode(source);
  expect(await sha256EffectV1Bytes(bytes)).toBe(
    'aa80499e9083d34bb9ea6f5d5ff047798ea76cd53c2584e8a9d5a93b8810c05e'
  );
  const strict = validateEffectV1Document(JSON.parse(source));
  expect(strict.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'CONTROL_GROUP_ICON_DUPLICATE', severity: 'error' })
  );
  expect((await importRawEffectDocument(bytes)).ok).toBe(false);
  const retained = validateEffectV1Document(JSON.parse(source), { presentationPolicy: 'retained' });
  expect(retained.ok).toBe(true);
  const project = createEmptyVideoProject();
  const hash = await sha256EffectV1Bytes(bytes);
  project.effectSnapshots = [
    {
      id: `effect:${hash}`,
      documentId: 'sniptale-title',
      schemaVersion: 'sniptale.effect.v1',
      kind: 'standalone',
      source,
      sha256: await sha256EffectV1Bytes(bytes),
      retainedByteLength: bytes.byteLength,
      assets: [],
    },
  ];
  project.effectInstances = [];
  expect(isEffectProjectBranches(project.effectSnapshots, project.effectInstances)).toBe(true);
  await expect(verifyVideoProjectEffectSnapshotIntegrity(project)).resolves.toBeUndefined();
  expect(readEffectPresentationDocument(source).document).toEqual(retained.document);
  expect(readReviewAnnotationEffectDocument(source)).toEqual(retained.document);
  expect(parseEffectRuntimeSnapshotDocument(project.effectSnapshots[0]!)).toEqual(
    retained.document
  );
  project.effectInstances = [
    {
      id: 'legacy',
      snapshotId: project.effectSnapshots[0]!.id,
      controls: {},
      duration: 4,
      enabled: true,
      kind: 'standalone',
      playbackRate: 1,
      startTime: 0,
      target: { kind: 'scene' },
    },
  ];
  const expectedLabel = resolveEffectLocaleText(retained.document!.label, getCurrentLocale());
  expect(getEffectInstanceLabel(project, 'legacy')).toBe(expectedLabel);
  expect(getEffectInstanceLabel(project, 'legacy')).toBe(expectedLabel);
  expect(project.effectSnapshots[0]!.source).toBe(source);
  expect(project.effectSnapshots[0]!.sha256).toBe(await sha256EffectV1Bytes(bytes));
});

it('still refuses malformed retained documents and changed source hashes', async () => {
  const malformed = JSON.stringify({ ...JSON.parse(source), kind: 'executable' });
  expect(readReviewAnnotationEffectDocument(malformed)).toBeNull();
  expect(readEffectPresentationDocument(malformed).document).toBeUndefined();
  expect(() => parseEffectRuntimeSnapshotDocument({ source: malformed })).toThrow();
  const project = createEmptyVideoProject();
  project.effectSnapshots = [
    {
      id: 'legacy-title',
      documentId: 'sniptale-title',
      schemaVersion: 'sniptale.effect.v1',
      kind: 'standalone',
      source,
      sha256: '0'.repeat(64),
      retainedByteLength: new TextEncoder().encode(source).byteLength,
      assets: [],
    },
  ];
  await expect(verifyVideoProjectEffectSnapshotIntegrity(project)).rejects.toThrow();
  project.effectSnapshots[0]!.source = malformed;
  project.effectInstances = [
    {
      id: 'invalid',
      snapshotId: project.effectSnapshots[0]!.id,
      controls: {},
      duration: 4,
      enabled: true,
      kind: 'standalone',
      playbackRate: 1,
      startTime: 0,
      target: { kind: 'scene' },
    },
  ];
  expect(getEffectInstanceLabel(project, 'invalid')).toBe(
    translate('videoEditor.effectsLibrary.unavailableEffect')
  );
  expect(getEffectInstanceLabel(project, 'missing')).toBe(
    translate('videoEditor.effectsLibrary.unavailableEffect')
  );
});
