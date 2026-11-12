import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { describe, expect, it } from 'vitest';

import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
} from '../effect-instance/types';
import { createEmptyVideoProject } from '../factories/creation';
import { hydrateVideoProject } from './index';

const SOURCE = readFileSync(
  'apps/extension/public/video-effects/animations/title.sniptale-animation.json',
  'utf8'
);
const SNAPSHOT_SHA256 = createHash('sha256').update(SOURCE).digest('hex');
const parsed = parseAnimationTemplateSource(SOURCE);
if (!parsed.ok) throw new Error('Expected valid shipped animation.');
const DOCUMENT_ID = parsed.template.id;

function createEffectSnapshot(): VideoProjectEffectSnapshot {
  return {
    assets: [],
    documentId: DOCUMENT_ID,
    id: `effect:${SNAPSHOT_SHA256}`,
    kind: 'standalone',
    retainedByteLength: Buffer.byteLength(SOURCE),
    schemaVersion: 'sniptale.animation.v1',
    sha256: SNAPSHOT_SHA256,
    source: SOURCE,
  };
}

function createEffectInstance(snapshotId: string): VideoProjectEffectInstance {
  return {
    controls: { opacity: 0.75 },
    duration: 2,
    enabled: true,
    id: 'hydration-instance',
    kind: 'standalone',
    playbackRate: 1,
    sourceStart: 0.5,
    snapshotId,
    startTime: 1,
    target: { kind: 'scene' },
  };
}

describe('animation project hydration', () => {
  it('preserves persisted snapshots and instances without creating a second authority', () => {
    const project = createEmptyVideoProject('effect-hydration');
    const snapshot = createEffectSnapshot();
    const instance = createEffectInstance(snapshot.id);
    project.effectSnapshots = [snapshot];
    project.effectInstances = [instance];

    const hydrated = hydrateVideoProject(project);

    expect(hydrated.effectSnapshots).toEqual([snapshot]);
    expect(hydrated.effectInstances).toEqual([instance]);
  });

  it('defaults absent animation branches to empty collections', () => {
    const project = createEmptyVideoProject('effect-hydration-defaults');
    const { effectInstances: _instances, effectSnapshots: _snapshots, ...withoutEffects } = project;

    const hydrated = hydrateVideoProject(withoutEffects);

    expect(hydrated.effectSnapshots).toEqual([]);
    expect(hydrated.effectInstances).toEqual([]);
  });
});
