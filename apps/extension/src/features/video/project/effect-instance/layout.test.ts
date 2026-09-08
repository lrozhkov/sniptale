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
    objectLayout: { width: 640, height: 280, resize: 'reflow' as const },
  };
  expect(createEffectHostClip(args).transform).toMatchObject({
    width: 640,
    height: 280,
    x: 640,
    y: 400,
  });
});

import { readFileSync } from 'node:fs';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import { createEmptyVideoProject } from '../factories/creation';
import {
  getEffectClipObjectLayout,
  initializeEffectSceneAnchors,
  resolveEffectClipTransformPatch,
  resolveEffectObjectControls,
} from './layout';
function fixture() {
  const source = readFileSync(
    new URL(
      '../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/' +
        'sniptale-callout-light.sniptale-effect.json',
      import.meta.url
    ),
    'utf8'
  );
  const document = parseEffectV1Source(source).document!;
  const project = createEmptyVideoProject('Layout');
  const clip = createEffectHostClip({
    effectInstanceId: 'effect',
    duration: 4,
    name: 'Callout',
    projectWidth: 1920,
    projectHeight: 1080,
    startTime: 0,
    trackId: project.tracks[0]!.id,
    objectLayout: document.objectLayout!,
  });
  const instance = {
    id: 'effect',
    snapshotId: 'snapshot',
    kind: 'standalone' as const,
    target: { kind: 'scene' as const },
    controls: { sequence: 2 },
    startTime: 0,
    duration: 4,
    enabled: true,
    playbackRate: 1,
  };
  project.clips = [clip];
  project.effectInstances = [instance];
  project.effectSnapshots = [
    {
      id: 'snapshot',
      source,
      assets: [],
      documentId: document.id,
      kind: 'standalone',
      schemaVersion: document.schemaVersion,
      retainedByteLength: source.length,
      sha256: '0'.repeat(64),
    },
  ];
  return { project, clip, document, instance };
}
it('derives the paired numeric dimension and bounds scale uniformly', () => {
  const { project, clip } = fixture();
  const limits = { min: 40, max: 7680 };
  expect(resolveEffectClipTransformPatch(project, clip, { width: 760 }, limits)).toEqual({
    width: 760,
    height: 240,
  });
  expect(resolveEffectClipTransformPatch(project, clip, { height: 240 }, limits)).toEqual({
    width: 760,
    height: 240,
  });
  expect(resolveEffectClipTransformPatch(project, clip, { height: 7680 }, limits)).toEqual({
    width: 7680,
    height: (7680 * 120) / 380,
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
  const anchors = initializeEffectSceneAnchors(document, clip.transform, {
    width: 1920,
    height: 1080,
  })!;
  const placed = { ...instance, sceneAnchors: anchors };
  const before = structuredClone(anchors);
  const controls = resolveEffectObjectControls(document, placed, {
    ...clip.transform,
    x: 1600,
    rotation: 90,
  });
  expect(controls['sequence']).toBe(2);
  expect(controls['anchorX']).toEqual(expect.any(Number));
  expect(placed.sceneAnchors).toEqual(before);
  expect(() => resolveEffectObjectControls(document, instance, clip.transform)).toThrow(
    'Missing effect scene anchor'
  );
  delete document.objectLayout;
  expect(
    initializeEffectSceneAnchors(document, clip.transform, { width: 1920, height: 1080 })
  ).toBeUndefined();
  expect(resolveEffectObjectControls(document, instance, clip.transform)['sequence']).toBe(2);
});
