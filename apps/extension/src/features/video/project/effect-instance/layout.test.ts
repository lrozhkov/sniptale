import { expect, it } from 'vitest';
import { createEffectHostClip } from '../factories/overlay-clip';
it('creates the body at its natural aspect instead of scene aspect', () => {
  const args = {
    duration: 4,
    effectInstanceId: 'effect',
    name: 'Frame',
    projectHeight: 1080,
    projectWidth: 1920,
    startTime: 0,
    trackId: 'video',
    dimensions: { width: 640, height: 280 },
  };
  expect(createEffectHostClip(args).transform).toMatchObject({
    width: 640,
    height: 280,
    x: 640,
    y: 400,
  });
});

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { createEmptyVideoProject } from '../factories/creation';
import type { VideoProjectEffectInstance } from './types';
import {
  getEffectClipObjectLayout,
  initializeEffectSceneAnchors,
  resolveEffectClipTransformPatch,
  resolveEffectObjectControls,
} from './layout';
function fixture() {
  const source = readFileSync(
    'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
    'utf8'
  );
  const accepted = parseAnimationTemplateSource(source);
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.diagnostics));
  const document = accepted.template;
  const hash = createHash('sha256').update(source).digest('hex');
  const snapshotId = `effect:${hash}`;
  const project = createEmptyVideoProject('Layout');
  const clip = createEffectHostClip({
    effectInstanceId: 'effect',
    duration: 4,
    name: 'Callout',
    projectWidth: 1920,
    projectHeight: 1080,
    startTime: 0,
    trackId: project.tracks[0]!.id,
    dimensions: { width: document.animation.w, height: document.animation.h },
  });
  const instance: VideoProjectEffectInstance = {
    id: 'effect',
    snapshotId,
    kind: 'standalone' as const,
    target: { kind: 'scene' as const },
    controls: {
      ...Object.fromEntries(document.controls.map((control) => [control.id, control.defaultValue])),
      opacity: 42,
    },
    startTime: 0,
    duration: 4,
    enabled: true,
    playbackRate: 1,
  };
  for (const handle of document.objectLayout?.handles ?? []) {
    delete instance.controls[handle.xControl];
    delete instance.controls[handle.yControl];
  }
  project.clips = [clip];
  project.effectInstances = [instance];
  project.effectSnapshots = [
    {
      id: snapshotId,
      source,
      assets: [],
      documentId: document.id,
      kind: 'standalone',
      schemaVersion: 'sniptale.animation.v1',
      retainedByteLength: Buffer.byteLength(source),
      sha256: hash,
    },
  ];
  return { project, clip, document, instance };
}
it('derives the paired numeric dimension and bounds scale uniformly', () => {
  const { project, clip } = fixture();
  const limits = { min: 40, max: 7680 };
  expect(resolveEffectClipTransformPatch(project, clip, { width: 760 }, limits)).toEqual({
    width: 760,
    height: 427.5,
  });
  expect(resolveEffectClipTransformPatch(project, clip, { height: 427.5 }, limits)).toEqual({
    width: 760,
    height: 427.5,
  });
  expect(resolveEffectClipTransformPatch(project, clip, { height: 7680 }, limits)).toEqual({
    width: 7680,
    height: (7680 * 180) / 320,
  });
  expect(resolveEffectClipTransformPatch(project, clip, { x: 15, rotation: 45 }, limits)).toEqual({
    x: 15,
    rotation: 45,
  });
  project.effectSnapshots = [];
  expect(getEffectClipObjectLayout(project, clip)).toBeUndefined();
  expect(
    resolveEffectClipTransformPatch(project, clip, { width: 760, height: 200 }, limits)
  ).toEqual({ width: 760, height: 200 });
});
it('initializes scene points and derives controls after body motion without mutating anchor state', () => {
  const { document, clip, instance } = fixture();
  const anchors = initializeEffectSceneAnchors(document, clip.transform)!;
  const placed = { ...instance, sceneAnchors: anchors };
  const before = structuredClone(anchors);
  const controls = resolveEffectObjectControls(document, placed, {
    ...clip.transform,
    x: 1600,
    rotation: 90,
  });
  expect(controls['opacity']).toBe(42);
  expect(controls['tipX']).toEqual(expect.any(Number));
  expect(placed.sceneAnchors).toEqual(before);
  expect(() => resolveEffectObjectControls(document, instance, clip.transform)).toThrow(
    'Missing effect scene anchor'
  );
  delete document.objectLayout;
  expect(initializeEffectSceneAnchors(document, clip.transform)).toBeUndefined();
  expect(resolveEffectObjectControls(document, instance, clip.transform)['opacity']).toBe(42);
});
