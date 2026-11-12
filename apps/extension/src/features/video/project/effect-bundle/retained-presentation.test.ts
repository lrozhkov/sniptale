import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import {
  effectControlSetSchema,
  resolveEffectLocaleText,
} from '@sniptale/runtime-contracts/effect-controls';
import { getCurrentLocale, translate } from '../../../../platform/i18n';
import { getEffectClipLabel, getEffectInstanceLabel } from '../effect-instance/presentation';
import { createEmptyVideoProject } from '../factories/creation';
import { createEffectHostClip } from '../factories/overlay-clip';
import { isEffectProjectBranches } from '../validation/effect-instances';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../effect-instance/integrity';
import { parseEffectRuntimeSnapshotDocument } from '../../composition/effect-runtime/runtime/snapshot-document';
import { readReviewAnnotationEffectDocument } from '../../review/annotation-effects/validation';
import { readEffectPresentationDocument } from './presentation-document';
import { importAnimationArtifactBytes } from './lottie-profile';

function fixture() {
  const source = readFileSync(
    'apps/extension/public/video-effects/animations/title.sniptale-animation.json',
    'utf8'
  );
  const accepted = parseAnimationTemplateSource(source);
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.diagnostics));
  const template = accepted.template,
    bytes = new TextEncoder().encode(source);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const project = createEmptyVideoProject('Presentation');
  project.effectSnapshots = [
    {
      id: `effect:${hash}`,
      documentId: template.id,
      schemaVersion: 'sniptale.animation.v1',
      kind: 'standalone',
      source,
      sha256: hash,
      retainedByteLength: bytes.length,
      assets: [],
    },
  ];
  project.effectInstances = [
    {
      id: 'applied',
      snapshotId: `effect:${hash}`,
      controls: Object.fromEntries(
        template.controls.map((control) => [control.id, control.defaultValue])
      ),
      duration: 4,
      enabled: true,
      kind: 'standalone',
      playbackRate: (template.animation.op - template.animation.ip) / template.animation.fr / 4,
      startTime: 0,
      target: { kind: 'scene' },
    },
  ];
  const clip = createEffectHostClip({
    effectInstanceId: 'applied',
    duration: 4,
    startTime: 0,
    name: '',
    trackId: project.tracks[0]!.id,
    projectWidth: project.width,
    projectHeight: project.height,
  });
  project.clips = [clip];
  project.duration = 4;
  return { source, template, project, clip, hash };
}

it('uses the supported immutable Lottie label consistently in applied presentation and frame consumers', async () => {
  const { source, template, project, clip, hash } = fixture(),
    before = structuredClone(project);
  const expected = resolveEffectLocaleText(template.label, getCurrentLocale());
  expect(expected).toBeTruthy();
  expect(expected).not.toBe(translate('videoEditor.effectsLibrary.unavailableEffect'));
  expect(getEffectInstanceLabel(project, 'applied')).toBe(expected);
  expect(getEffectInstanceLabel(project, 'applied')).toBe(expected);
  expect(getEffectClipLabel(project, clip)).toBe(expected);
  expect(getEffectClipLabel(project, { ...clip, name: 'Authored name' })).toBe('Authored name');
  expect(isEffectProjectBranches(project.effectSnapshots, project.effectInstances)).toBe(true);
  await expect(verifyVideoProjectEffectSnapshotIntegrity(project)).resolves.toBeUndefined();
  expect(readEffectPresentationDocument(source).document).toEqual(template);
  expect(readReviewAnnotationEffectDocument(source)).toEqual(template);
  expect(parseEffectRuntimeSnapshotDocument(project.effectSnapshots![0]!)).toEqual(template);
  expect(project).toEqual(before);
  expect(project.effectSnapshots![0]).toMatchObject({ source, sha256: hash });
});

it('refuses duplicate icon metadata through new import and every retained-source reader', async () => {
  const { template } = fixture();
  template.controlGroups = [
    { id: 'one', parentId: 'appearance', label: { en: 'One' }, icon: 'text' },
    { id: 'two', parentId: 'appearance', label: { en: 'Two' }, icon: 'text' },
  ];
  const source = JSON.stringify(template);
  const strict = parseAnimationTemplateSource(source);
  expect(strict.ok).toBe(false);
  expect(strict.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'ANIMATION_CONTROLS' })
  );
  const metadata = effectControlSetSchema.safeParse({
    controls: template.controls,
    controlGroups: template.controlGroups,
  });
  expect(metadata.success).toBe(false);
  if (!metadata.success)
    expect(metadata.error.issues.some((item) => item.message.includes('icon'))).toBe(true);
  expect((await importAnimationArtifactBytes(new TextEncoder().encode(source))).ok).toBe(false);
  expect(readEffectPresentationDocument(source).document).toBeNull();
  expect(readReviewAnnotationEffectDocument(source)).toBeNull();
  expect(() => parseEffectRuntimeSnapshotDocument({ source })).toThrow();
});

it('keeps historical V1 bytes intact but refuses their admission and presentation', async () => {
  const source = readFileSync(
    'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/title.sniptale-effect.json',
    'utf8'
  );
  const hash = createHash('sha256').update(source).digest('hex');
  expect(hash).toBe('aa80499e9083d34bb9ea6f5d5ff047798ea76cd53c2584e8a9d5a93b8810c05e');
  expect((await importAnimationArtifactBytes(new TextEncoder().encode(source))).ok).toBe(false);
  expect(readEffectPresentationDocument(source).document).toBeNull();
  expect(readReviewAnnotationEffectDocument(source)).toBeNull();
  expect(() => parseEffectRuntimeSnapshotDocument({ source })).toThrow();
  const { project } = fixture(),
    snapshot = project.effectSnapshots![0]!;
  expect(
    isEffectProjectBranches([{ ...snapshot, schemaVersion: 'sniptale.effect.v1', source }], [])
  ).toBe(false);
  Object.assign(snapshot, {
    source,
    sha256: hash,
    id: `effect:${hash}`,
    retainedByteLength: Buffer.byteLength(source),
  });
  await expect(verifyVideoProjectEffectSnapshotIntegrity(project)).rejects.toThrow();
  project.effectInstances![0]!.snapshotId = snapshot.id;
  expect(getEffectInstanceLabel(project, 'applied')).toBe(
    translate('videoEditor.effectsLibrary.unavailableEffect')
  );
  expect(snapshot.source).toBe(source);
  expect(createHash('sha256').update(snapshot.source).digest('hex')).toBe(hash);
});

it('refuses malformed retained sources and changed hashes without manufacturing a label', async () => {
  const { project, template } = fixture();
  project.effectSnapshots![0]!.sha256 = '0'.repeat(64);
  await expect(verifyVideoProjectEffectSnapshotIntegrity(project)).rejects.toThrow();
  const malformed = JSON.stringify({ ...template, format: 'executable' });
  expect(readReviewAnnotationEffectDocument(malformed)).toBeNull();
  expect(readEffectPresentationDocument(malformed).document).toBeNull();
  expect(() => parseEffectRuntimeSnapshotDocument({ source: malformed })).toThrow();
  project.effectSnapshots![0]!.source = malformed;
  expect(getEffectInstanceLabel(project, 'applied')).toBe(
    translate('videoEditor.effectsLibrary.unavailableEffect')
  );
  expect(getEffectInstanceLabel(project, 'missing')).toBe(
    translate('videoEditor.effectsLibrary.unavailableEffect')
  );
});
