import { initializeEffectSceneAnchors } from '../../features/video/project/effect-instance/layout';
import { initializeReviewAnnotationEffectAnchors } from '../../features/video/review/annotation-effects/layout';
import { exportEffectInstance } from '../../features/video/project/effect-instance/export';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../features/video/project/effect-instance/integrity';
import { applyEffectCatalogDocument } from '../../features/video/project/effect-instance/apply';
import {
  isEffectProjectBranches,
  hasValidEffectProjectReferences,
} from '../../features/video/project/validation/effect-instances';
import type { EffectBundleCatalogEntry } from '../../features/video/project/effect-bundle/catalog';
import { expect, it } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { validateAnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { createEffectHostClip } from '../../features/video/project/factories/overlay-clip';
import {
  resolveEffectRuntimeFramePlans,
  applyEffectRuntimeRasterDimensions,
} from '../../features/video/composition/effect-runtime/frame/plan';
import { createEffectRuntimeRenderMessage } from '../../features/video/composition/effect-runtime/runtime/request';
import { parseEffectRuntimeSnapshotDocument } from '../../features/video/composition/effect-runtime/runtime/snapshot-document';
import { resolveEffectRuntimeAudioPlans } from '../../features/video/composition/effect-runtime/audio/plan';
import { planReviewAnnotationFrame } from '../../workflows/video-review/annotation-renderer';
import { parseEffectRuntimeRenderRequest } from './request-boundary';
import { EFFECT_RUNTIME_PROTOCOL_VERSION } from '../../contracts/effect-runtime/types';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffectSnapshot,
} from '../../features/video/review/annotation-effects/types';
import type { ReviewTimeSegment } from '../../features/video/review/time-segment';

function fixture(handles = false) {
  const accepted = validateAnimationTemplate({
    format: 'sniptale-animation',
    version: 1,
    id: 'producer-proof',
    label: { en: 'Producer proof' },
    resources: [],
    controls: handles
      ? [
          { id: 'x', kind: 'number', min: -10000, max: 10000, defaultValue: 160 },
          { id: 'y', kind: 'number', min: -10000, max: 10000, defaultValue: 90 },
        ]
      : [],
    bindings: handles ? [{ kind: 'vector', slot: 'position', xControl: 'x', yControl: 'y' }] : [],
    ...(handles
      ? {
          objectLayout: {
            handles: [
              { id: 'tip', label: { en: 'Tip' }, xControl: 'x', yControl: 'y', padding: 16 },
            ],
          },
        }
      : {}),
    animation: {
      v: '5.12.2',
      w: 320,
      h: 180,
      fr: 30,
      ip: 30,
      op: 90,
      layers: [],
      assets: [],
      ...(handles ? { slots: { position: { p: { a: 0, k: [160, 90] } } } } : {}),
    },
  });
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.diagnostics));
  const document = accepted.template,
    source = JSON.stringify(document),
    hash = bytesToHex(sha256(new TextEncoder().encode(source)));
  const snapshot: ReviewAnnotationEffectSnapshot & { assets: [] } = {
    id: `effect:${hash}`,
    sha256: hash,
    source,
    schemaVersion: 'sniptale.animation.v1',
    kind: 'standalone',
    documentId: document.id,
    retainedByteLength: new TextEncoder().encode(source).byteLength,
    assets: [],
  };
  const project = createEmptyVideoProject('Producer proof', 320, 180);
  project.duration = 10;
  project.fps = 60;
  const host = createEffectHostClip({
    duration: 4,
    effectInstanceId: 'instance',
    name: 'Proof',
    trackId: project.tracks[0]!.id,
    projectWidth: 320,
    projectHeight: 180,
    startTime: 2,
  });
  host.transform = { ...host.transform, x: 80, y: 45, width: 160, height: 90, rotation: 30 };
  project.clips = [host];
  project.effectSnapshots = [snapshot];
  project.effectInstances = [
    {
      id: 'instance',
      kind: 'standalone',
      snapshotId: snapshot.id,
      enabled: true,
      startTime: 2,
      duration: 4,
      playbackRate: 0.5,
      target: { kind: 'scene' },
      controls: {},
      ...(handles ? { sceneAnchors: { tip: { x: 260, y: 90 } } } : {}),
    },
  ];
  const instance: ReviewAnnotationEffect = {
    id: 'instance',
    snapshotId: snapshot.id,
    enabled: true,
    start: 2,
    end: 6,
    attachment: 'content',
    transform: { x: 0.25, y: 0.25, width: 0.5, height: 0.5, rotation: Math.PI / 6 },
    controls: {},
    order: 0,
    ...(handles ? { anchors: { tip: { x: 260 / 320, y: 0.5 } } } : {}),
  };
  const segments: ReviewTimeSegment[] = [
    { sourceStart: 0, sourceEnd: 10, resultStart: 0, resultEnd: 10, kind: 'keep', rate: 1 },
  ];
  return { document, project, instance, snapshot, segments, host };
}
function gallery(value: ReturnType<typeof fixture>, time: number) {
  return planReviewAnnotationFrame({
    ...value,
    time,
    plane: { width: 320, height: 180 },
    density: { width: 1, height: 1 },
    fps: 60,
  });
}
it.each([false, true])(
  'matches Native and Gallery intrinsic bounds and local PTS (handles=%s)',
  (handles) => {
    const value = fixture(handles),
      native = resolveEffectRuntimeFramePlans(value.project, 3)[0]!,
      review = gallery(value, 3)!.plan;
    expect(native).toMatchObject({ time: 0.5, duration: 2, progress: 0.25, frameIndex: 30 });
    // Gallery quantizes derived anchors to 1e-10 intrinsic units. Allow only numerical propagation.
    const numericFields = (fields: object, precision: number) =>
      Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [
          key,
          typeof value === 'number' ? expect.closeTo(value, precision) : value,
        ])
      );
    expect(native.controls).toEqual(numericFields(review.controls, 9));
    expect(native.bitmapBounds).toEqual(numericFields(review.bitmapBounds!, 11));
    expect(native.dimensions).toEqual(numericFields(review.dimensions, 9));
    expect(
      Math.abs(native.renderDimensions.width - review.renderDimensions.width)
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(native.renderDimensions.height - review.renderDimensions.height)
    ).toBeLessThanOrEqual(1);
    if (handles) expect(native.dimensions.width).toBeGreaterThan(320);
  }
);
it('keeps intrinsic coordinates while changing physical density and reuses a frozen immutable document', () => {
  const value = fixture(),
    native = resolveEffectRuntimeFramePlans(value.project, 3)[0]!;
  expect(native.dimensions).toEqual({ width: 320, height: 180 });
  expect(native.renderDimensions).toEqual({ width: 160, height: 90 });
  const high = applyEffectRuntimeRasterDimensions(native, { width: 640, height: 360 });
  expect(high.dimensions).toEqual(native.dimensions);
  expect(high.time).toBe(native.time);
  const document = parseEffectRuntimeSnapshotDocument(value.snapshot);
  expect(parseEffectRuntimeSnapshotDocument(value.snapshot)).toBe(document);
  expect(Object.isFrozen(document.animation)).toBe(true);
});
it('uses the same retained phase through sourceStart, held frames and half-open EOF', () => {
  const value = fixture(),
    instance = value.project.effectInstances![0]!;
  instance.duration = 2;
  instance.sourceStart = 0.5;
  value.host.duration = 2;
  expect(resolveEffectRuntimeFramePlans(value.project, 3)[0]).toMatchObject({
    time: 1,
    progress: 0.5,
  });
  value.host.playbackWindow = { offset: 0, holdAt: 0.5 };
  expect(resolveEffectRuntimeFramePlans(value.project, 3.5)[0]).toMatchObject({
    time: 0.75,
    progress: 0.375,
  });
  expect(resolveEffectRuntimeFramePlans(value.project, 4)).toEqual([]);
});
it('preserves the shared clock after a cut and speed change without restarting at the splice', () => {
  const value = fixture();
  value.segments = [
    { sourceStart: 0, sourceEnd: 3, resultStart: 0, resultEnd: 3, kind: 'keep', rate: 1 },
    { sourceStart: 3, sourceEnd: 4, resultStart: 3, resultEnd: 3, kind: 'cut', rate: 1 },
    { sourceStart: 4, sourceEnd: 6, resultStart: 3, resultEnd: 4, kind: 'speed', rate: 2 },
  ];
  value.project.effectInstances![0]!.duration = 2;
  value.project.effectInstances![0]!.playbackRate = 1;
  value.host.duration = 2;
  expect(gallery(value, 3)!.plan.time).toBe(1);
  expect(resolveEffectRuntimeFramePlans(value.project, 3)[0]!.time).toBe(1);
  expect(gallery(value, 4)).toBeNull();
});
it('forwards only a verified complete package with its exact resource identity to the real broker parser', async () => {
  const value = fixture(true),
    plan = resolveEffectRuntimeFramePlans(value.project, 3)[0]!;
  const command = await createEffectRuntimeRenderMessage({
    plan,
    inputFrames: {},
    requestId: 'frame',
    sequenceId: 1,
  });
  const { materializeImmutablePayloads, ...fields } = command;
  const payload = await materializeImmutablePayloads();
  expect(payload.assets).toEqual([]);
  const parsed = await parseEffectRuntimeRenderRequest({
    ...fields,
    kind: 'renderFrame',
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    documentRef: { id: command.documentRef.id, source: payload.documentSource },
    assetSelectionRef: { id: command.assetSelectionRef.id, assets: [] },
  });
  expect(parsed.ok).toBe(true);
  if (parsed.ok)
    expect(parsed.request).toMatchObject({
      time: plan.time,
      width: plan.dimensions.width,
      renderWidth: plan.renderDimensions.width,
    });
  await expect(
    createEffectRuntimeRenderMessage({
      plan: { ...plan, documentSha256: '0'.repeat(64) },
      inputFrames: {},
      requestId: 'bad',
      sequenceId: 2,
    }).then((value) => value.materializeImmutablePayloads())
  ).rejects.toThrow('EFFECT_RUNTIME_ANIMATION_INTEGRITY_FAILED');
});
it('does not turn unsupported active sources into empty frames or silent audio omission', () => {
  const value = fixture(),
    source = value.snapshot.source;
  expect(resolveEffectRuntimeAudioPlans(value.project)).toEqual([]);
  value.snapshot.source = JSON.stringify({
    schemaVersion: 'sniptale.effect.v1',
    kind: 'standalone',
  });
  expect(() => resolveEffectRuntimeFramePlans(value.project, 3)).toThrow(
    expect.objectContaining({ code: 'effectPlanIntegrityFailure' })
  );
  expect(() => resolveEffectRuntimeAudioPlans(value.project)).toThrow(
    expect.objectContaining({ code: 'effectAudioIntegrityFailure' })
  );
  value.snapshot.source = source;
  expect(resolveEffectRuntimeFramePlans(value.project, 3)).toHaveLength(1);
});

it('applies an immutable Lottie package through the Native command owner and admits it for save/reopen', async () => {
  const value = fixture(),
    project = createEmptyVideoProject('Application proof', 320, 180);
  const catalog: EffectBundleCatalogEntry = {
    packId: 'proof-pack',
    version: '1',
    source: 'raw-json',
    sourceSha256: value.snapshot.sha256,
    enabled: true,
    label: { en: 'Proof', ru: 'Проверка' },
    description: { en: 'Proof', ru: 'Проверка' },
    assets: [],
    createdAt: 1,
    updatedAt: 1,
    retainedByteLength: value.snapshot.retainedByteLength,
    documents: [
      {
        id: value.document.id,
        kind: 'standalone',
        schemaVersion: 'sniptale.animation.v1',
        assets: [],
        sha256: value.snapshot.sha256,
        source: value.snapshot.source,
      },
    ],
  };
  const applied = await applyEffectCatalogDocument({
    catalog,
    documentId: value.document.id,
    instanceId: 'new-instance',
    project,
    startTime: 1,
    target: { kind: 'scene' },
  });
  expect(project.effectInstances).toEqual([]);
  expect(isEffectProjectBranches(applied.effectSnapshots, applied.effectInstances)).toBe(true);
  expect(hasValidEffectProjectReferences(applied)).toBe(true);
  expect(applied.effectSnapshots![0]).toMatchObject({
    schemaVersion: 'sniptale.animation.v1',
    assets: [],
  });
  catalog.documents.length = 0;
  expect(resolveEffectRuntimeFramePlans(applied, 1.5)[0]).toMatchObject({ time: 0.5, duration: 2 });
  expect(
    isEffectProjectBranches(
      [{ ...applied.effectSnapshots![0]!, schemaVersion: 'sniptale.effect.v1' }],
      applied.effectInstances
    )
  ).toBe(false);
});

it('exports a self-contained current animation package without mutating its project snapshot', async () => {
  const value = fixture(true),
    source = value.snapshot.source;
  await verifyVideoProjectEffectSnapshotIntegrity(value.project);
  const exported = await exportEffectInstance(value.project, 'instance');
  expect(exported.filename).toMatch(/\.sniptale-animation\.json$/);
  const parsed = validateAnimationTemplate(JSON.parse(await exported.blob.text()));
  expect(parsed.ok).toBe(true);
  if (parsed.ok)
    expect(parsed.template.controls.find((control) => control.id === 'x')?.defaultValue).toBe(
      resolveEffectRuntimeFramePlans(value.project, 3)[0]!.controls['x']
    );
  expect(value.snapshot.source).toBe(source);
  value.snapshot.sha256 = '0'.repeat(64);
  await expect(exportEffectInstance(value.project, 'instance')).rejects.toMatchObject({
    code: 'effectSnapshotIntegrityFailure',
  });
});

it('preserves the same authored tip outside the source plane in both editors', () => {
  const value = fixture(true);
  value.document.controls.find((control) => control.id === 'x')!.defaultValue = 1000;
  const controls = { x: 1000, y: 90 };
  const native = initializeEffectSceneAnchors(value.document, value.host.transform)!;
  const review = initializeReviewAnnotationEffectAnchors(
    value.document,
    value.instance.transform,
    controls,
    { width: 320, height: 180 }
  )!;
  expect(review['tip']!.x).toBeGreaterThan(1);
  expect(native['tip']!.x).toBeCloseTo(review['tip']!.x * 320, 10);
  expect(native['tip']!.y).toBeCloseTo(review['tip']!.y * 180, 10);
});
