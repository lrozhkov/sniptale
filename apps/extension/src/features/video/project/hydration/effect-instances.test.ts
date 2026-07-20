import { describe, expect, it } from 'vitest';

import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
} from '../effect-instance/types';
import { createEmptyVideoProject } from '../factories/creation';
import { hydrateVideoProject } from './index';

const SNAPSHOT_SHA256 = 'a'.repeat(64);

function createEffectSnapshot(): VideoProjectEffectSnapshot {
  return {
    assets: [],
    documentId: 'hydration-effect',
    id: `effect:${SNAPSHOT_SHA256}`,
    kind: 'standalone',
    retainedByteLength: 2,
    schemaVersion: 'sniptale.effect.v1',
    sha256: SNAPSHOT_SHA256,
    source: '{}',
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
    snapshotId,
    startTime: 1,
    target: { kind: 'scene' },
  };
}

describe('EffectV1 project hydration', () => {
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

  it('defaults absent EffectV1 branches to empty collections', () => {
    const project = createEmptyVideoProject('effect-hydration-defaults');
    const { effectInstances: _instances, effectSnapshots: _snapshots, ...withoutEffects } = project;

    const hydrated = hydrateVideoProject(withoutEffects);

    expect(hydrated.effectSnapshots).toEqual([]);
    expect(hydrated.effectInstances).toEqual([]);
  });
});
